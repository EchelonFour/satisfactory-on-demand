import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  filter,
  from,
  map,
  mergeMap,
  NEVER,
  pairwise,
  startWith,
  tap,
} from 'rxjs'

import './init.js'

import config from './config.js'
import globalLogger from './logger.js'
import { EnvoyManager } from './envoy.js'
import { currentSessionCount$ } from './sessions.js'
import { cloudManagerFromConfig } from './cloud/cloud-manager-builder.js'
import { FakeQueryServer } from './fake-query-server.js'
import { EnvoyConfigBuilder } from './envoy-config-builder.js'

const MS_IN_SECONDS = 1000

const logger = globalLogger.child({ module: 'main' })

const envoyConfig = new EnvoyConfigBuilder()
const envoy = new EnvoyManager()

const cloudManager = cloudManagerFromConfig()
await cloudManager.loadCurrentState()

const fake = new FakeQueryServer()
await fake.start()

const sessions$ = currentSessionCount$()

sessions$
  .pipe(
    debounceTime(config.get('shutdownDelay') * MS_IN_SECONDS),
    filter((sessions) => sessions === 0),
    tap(() => logger.info('reckon no one is logged in anymore')),
    mergeMap(() =>
      from(cloudManager.shutdown()).pipe(
        catchError((error: unknown) => {
          logger.error({ error }, 'error trying to shut down the server')
          return NEVER
        }),
      ),
    ),
  )
  .subscribe(() => {
    logger.info('server shut down')
  })

sessions$
  .pipe(
    pairwise(),
    filter(([previousSessions, currentSessions]) => previousSessions === 0 && currentSessions > 0),
    tap(() => logger.info('someone is here, time to boot')),
    mergeMap(() =>
      from(cloudManager.start()).pipe(
        catchError((error: unknown) => {
          logger.error({ error }, 'error trying to boot up server')
          return NEVER
        }),
      ),
    ),
  )
  .subscribe(() => {
    logger.info('server booted up')
  })

cloudManager.currentServerDetails$
  .pipe(
    map((server) => {
      if ('ipAddress' in server && server.ipAddress) {
        return envoyConfig.getForIp(server.ipAddress)
      }
      return envoyConfig.getForLocalFake()
    }),
    startWith(envoyConfig.getForLocalFake()),
    distinctUntilChanged(),
    mergeMap((currentEnvoyConfig) =>
      from(envoy.start(currentEnvoyConfig)).pipe(
        catchError((error: unknown) => {
          logger.error({ error }, 'could not change envoy config')
          return NEVER
        }),
      ),
    ),
  )
  .subscribe(() => {
    logger.info('envoy config updated')
  })
