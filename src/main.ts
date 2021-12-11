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
} from 'rxjs'

import './init.js'

import config from './config.js'
import globalLogger from './logger.js'
import { EnvoyManager } from './envoy.js'
import { currentSessionCount$ } from './sessions.js'
import { cloudManagerFromConfig } from './cloud/cloud-manager-builder.js'
import { FakeQueryServer } from './fake-query-server.js'
import { EnvoyConfigBuilder } from './envoy-config-builder.js'

const logger = globalLogger.child({ module: 'main' })

const envoyConfig = new EnvoyConfigBuilder()
const envoy = new EnvoyManager()

const cloudManager = cloudManagerFromConfig()
await cloudManager.loadCurrentState()

const fake = new FakeQueryServer()
await fake.start()

const sessions$ = currentSessionCount$()

async function shutdownHandler(): Promise<void> {
  logger.info('reckon no one is logged in anymore')
  try {
    await cloudManager.shutdown()
  } catch (error) {
    logger.error({ error }, 'error trying to shut down the server')
  }
}
const shutdownListener = sessions$
  .pipe(
    debounceTime(config.get('shutdownDelay') * 1000),
    filter((sessions) => sessions === 0),
  )
  .subscribe(() => {
    void shutdownHandler()
  })

async function bootupHandler(): Promise<void> {
  logger.info('someone is here, time to boot')
  try {
    await cloudManager.start()
  } catch (error) {
    logger.error({ error }, 'error trying to boot up server')
  }
}
const bootupListener = sessions$
  .pipe(
    pairwise(),
    filter(([previousSessions, currentSessions]) => previousSessions === 0 && currentSessions > 0),
  )
  .subscribe(() => {
    void bootupHandler()
  })

const ipListener = cloudManager.currentServerDetails$
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
        catchError((error) => {
          logger.error({ error }, 'could not change envoy config')
          return NEVER
        }),
      ),
    ),
  )
  .subscribe(() => {
    logger.info('envoy config updated')
  })
