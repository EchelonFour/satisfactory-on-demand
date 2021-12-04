import type convict from 'convict'

export interface AwsCloudManagerConfig {
  region: string | null
  accessKeyId: string | null
  secretAccessKey: string | null
}
export const awsConfigOptions: convict.Schema<AwsCloudManagerConfig> = {
  region: {
    doc: 'region to deploy server to',
    format: '*',
    default: null,
  },
  accessKeyId: {
    doc: 'access key from aws',
    format: '*',
    default: null,
  },
  secretAccessKey: {
    doc: 'secret access key from aws',
    format: '*',
    default: null,
  },
}
