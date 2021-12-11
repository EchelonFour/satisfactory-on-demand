import pino from 'pino'
import config from './config.js'

export const globalLogger = pino({
  level: config.get('logLevel'),
})

// use pino.final to create a special logger that guarantees final tick writes
const handler = pino.final(globalLogger, (err, finalLogger, evt) => {
  // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
  finalLogger.info(`${evt} caught`)
  if (err) finalLogger.error(err, 'error caused exit')
  process.exit(err ? 1 : 0)
})
process.on('beforeExit', () => handler(null, 'beforeExit'))
process.on('exit', () => handler(null, 'exit'))
process.on('uncaughtException', (err) => handler(err, 'uncaughtException'))
process.on('SIGINT', () => handler(null, 'SIGINT'))
process.on('SIGQUIT', () => handler(null, 'SIGQUIT'))
process.on('SIGTERM', () => handler(null, 'SIGTERM'))

export default globalLogger
