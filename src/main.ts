import { debounceTime, filter, pairwise } from 'rxjs'

import './init.js'

import config from './config.js'
import globalLogger from './logger.js'
import { EnvoyManager } from './envoy.js'
import { currentSessionCount$ } from './sessions.js'
import { cloudManagerFromConfig } from './cloud/cloud-manager-builder.js'

const logger = globalLogger.child({ module: 'main' })

const envoy = new EnvoyManager()
envoy.start() // will start with localhost

const cloudManager = cloudManagerFromConfig()
await cloudManager.loadCurrentState()

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
    const newIp = await cloudManager.start()
    await envoy.setToNewIp(newIp)
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
