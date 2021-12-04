import convict from 'convict'
import { existsSync } from 'fs'
import { awsConfigOptions } from './cloud/aws/config.js'
import { vultrConfigOptions } from './cloud/vultr/config.js'

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
  envoyConfigTemplate: {
    doc: 'Location of the template that we will use for envoy',
    format: '*',
    default: './envoy.yaml',
    env: 'ENVOY_TEMPLATE',
  },
  envoyAdminPort: {
    doc: 'Port hosting envoy admin console',
    format: 'port',
    default: 19000,
    env: 'ENVOY_ADMIN_PORT',
  },
  statsReadInterval: {
    doc: 'How many milliseconds we wait between checking active sessions',
    format: 'nat',
    default: 1000,
    env: 'STATS_READ_INTERVAL',
  },
  shutdownDelay: {
    doc: 'How many seconds to wait before actually shutting server down when it hits 0',
    format: 'int',
    default: 180,
    env: 'STATS_READ_INTERVAL',
  },
  nameOfSatisfactoryServer: {
    doc: 'Name to give the satisfactory server when it boots',
    format: '*',
    default: 'satisfactory',
    env: 'CLOUD_SERVER_NAME',
  },
  nameOfSatisfactorySnapshot: {
    doc: 'Name to give the satisfactory snapshot',
    format: '*',
    default: 'satisfactory',
    env: 'CLOUD_SNAPSHOT_NAME',
  },
  cloudManager: {
    doc: 'which cloud manager to use',
    format: ['aws', 'vultr'],
    default: 'aws' as 'aws' | 'vultr',
    env: 'CLOUD_MANAGER',
  },
  awsConfig: awsConfigOptions,
  vultrConfig: vultrConfigOptions,
})
const env = config.get('env')
const filesToLoad = [`./config/${env}.json`, `./config/local.json`]
for (const file of filesToLoad) {
  if (existsSync(file)) {
    config.loadFile(file)
  }
}

export default config
