import pino from 'pino'
import config from './config.js'

export const globalLogger = pino({
  level: config.get('logLevel'),
})

export default globalLogger
