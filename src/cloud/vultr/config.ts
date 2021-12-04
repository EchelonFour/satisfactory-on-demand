import type convict from 'convict'

export interface VultrCloudManagerConfig {
  apiKey: string
  region: string
  plan: string
  sshKey: string
  hostname: string | null
  extendedJsonOptions: string | null
}
export type VultrCloudManagerConfigAsDefined = {
  [K in keyof VultrCloudManagerConfig]: VultrCloudManagerConfig[K] | null
}
export const vultrConfigOptions: convict.Schema<VultrCloudManagerConfigAsDefined> = {
  apiKey: {
    doc: 'vultr api key',
    format: '*',
    default: null,
  },
  region: {
    doc: 'vultr region id to deploy server to',
    format: '*',
    default: null,
  },
  plan: {
    doc: 'vultr plan id to deploy server with',
    format: '*',
    default: null,
  },
  sshKey: {
    doc: 'vultr sshKey id to deploy server with',
    format: '*',
    default: null,
  },
  hostname: {
    doc: 'hostname to deploy vultr server with',
    format: '*',
    default: null,
  },
  extendedJsonOptions: {
    doc: 'a json object containing any other fields on the create instance api request https://www.vultr.com/api/#operation/create-instance that will be set',
    format: '*',
    default: null,
  },
}
