import config from './config.js'
import globalLogger from './logger.js'

config.validate({
  allowed: 'strict',
  output: (message) => {
    globalLogger.error(message)
  },
})
