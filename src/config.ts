import convict from 'convict'
import { existsSync } from 'fs'

export const config = convict({
  env: {
    doc: 'The application environment.',
    format: ['production', 'development', 'test'],
    default: 'development',
    env: 'NODE_ENV',
  },
  logLevel: {
    doc: 'Level of logs to print to stdout.',
    format: ['fatal', 'error', 'warn', 'info', 'debug', 'trace'],
    default: 'debug' as 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace',
    env: 'LOG_LEVEL',
  },
})
const env = config.get('env')
const filesToLoad = [`./config/${env}.json`, `./config/local.json`]
for (const file of filesToLoad) {
  if (existsSync(file)) {
    config.loadFile(file)
  }
}

export default config
