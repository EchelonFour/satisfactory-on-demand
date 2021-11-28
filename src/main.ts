import config from './config.js'
import globalLogger from './logger.js'

import './init.js'
import { EnvoyManager } from './envoy.js'
import { currentSessionCount$ } from './sessions.js'
import { debounceTime, filter, pairwise } from 'rxjs'
import { cloudManagerFromConfig } from './cloud/cloud-manager-builder.js'

const logger = globalLogger.child({ module: 'main' })

const envoy = new EnvoyManager()
envoy.start() // will start with localhost

const cloudManager = cloudManagerFromConfig()
await cloudManager.loadCurrentState()

const sessions$ = currentSessionCount$()

const shutdownListener = sessions$
  .pipe(
    debounceTime(config.get('shutdownDelay') * 1000),
    filter((sessions) => sessions === 0),
  )
  .subscribe(async () => {
    logger.info('reckon no one is logged in anymore')
    await cloudManager.shutdown()
  })

const bootupListener = sessions$
  .pipe(
    pairwise(),
    filter(([previousSessions, currentSessions]) => previousSessions === 0 && currentSessions > 0),
  )
  .subscribe(async () => {
    logger.info('someone is here, time to boot')
    const newIp = await cloudManager.start()
    envoy.setToNewIp(newIp)
  })
