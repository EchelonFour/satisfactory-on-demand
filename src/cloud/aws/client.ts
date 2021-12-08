import { EC2, EC2ClientConfig, Instance, InstanceStateName, SpotInstanceState } from '@aws-sdk/client-ec2'
import { AbortController } from 'node-abort-controller'
import { CloudManager, ServerDetails, ServerDetailsStopping } from '../cloud-manager.js'
import globalLogger from '../../logger.js'
import { AwsCloudManagerConfig } from './config.js'

const logger = globalLogger.child({ module: 'aws' })

export type AwsServerDetails = ServerDetails & {
  instanceId: string
}
interface InstanceStatus {
  ec2Status: InstanceStateName | null
  spotStatus: SpotInstanceState | null
  ipAddress: string | null
  stableStatus: boolean
}
const AWS_ACTION_LOG = 'aws action'
export class AwsManager extends CloudManager<AwsServerDetails> {
  private client: EC2

  constructor(nameOfServer: string, nameOfSnapshot: string, config: AwsCloudManagerConfig) {
    super(nameOfServer, nameOfSnapshot)
    const ec2Config: EC2ClientConfig = {
      logger: {
        debug(content) {
          logger.trace(content, AWS_ACTION_LOG)
        },
        error(content) {
          logger.error(content, AWS_ACTION_LOG)
        },
        info(content) {
          logger.trace(content, AWS_ACTION_LOG)
        },
        warn(content) {
          logger.warn(content, AWS_ACTION_LOG)
        },
      },
    }
    if (config.region) {
      ec2Config.region = config.region
    }
    if (config.accessKeyId && config.secretAccessKey) {
      ec2Config.credentials = {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      }
    }
    this.client = new EC2(ec2Config)
  }

  public async getColdStatus(instanceName: string, snapshotName: string): Promise<AwsServerDetails> {
    const existingServers = await this.client.describeInstances({
      Filters: [
        {
          Name: 'tag:Name',
          Values: [instanceName || snapshotName],
        },
        {
          Name: 'instance-state-name',
          Values: ['pending', 'running', 'shutting-down', 'stopping', 'stopped'], // not terminated
        },
      ],
    })
    const allInstances = existingServers.Reservations?.flatMap((reservation) => reservation.Instances)?.filter(
      (i): i is Instance => i != null,
    )
    if (!allInstances || allInstances.length === 0) {
      throw new Error('could not find a server to manage in ec2')
    } else if (allInstances.length > 1) {
      throw new Error('too many servers found in ec2. Unable to determine correct one to manage')
    }
    const managedInstance = allInstances[0]
    if (!managedInstance.InstanceId) {
      throw new Error('instance has no id, somehow')
    }
    logger.info(`managing the instance with id: ${managedInstance.InstanceId}`)
    const status = await this.waitForStatus(async () => {
      const serverStatus = await this.getServerStatus(this.currentServerDetails.instanceId)
      return [serverStatus.stableStatus, serverStatus]
    })
    if (status[1]?.ec2Status === 'running') {
      if (!status[1]?.ipAddress) {
        throw new Error('no ip on a running computer??')
      }
      return {
        state: 'running',
        instanceId: managedInstance.InstanceId,
        ipAddress: status[1].ipAddress,
      }
    }
    if (status[1]?.ec2Status === 'stopped') {
      return {
        state: 'stopped',
        instanceId: managedInstance.InstanceId,
      }
    }
    logger.error({ status: status[1] }, 'unexpected status was declared stable')
    throw new Error('could not recover state of aws instance')
  }

  public async startServer(): Promise<AwsServerDetails & { state: 'running' }> {
    logger.info('starting aws instance')
    if (!this.currentServerDetails.instanceId) {
      throw new Error('cannot start a server, as no id is known for the stopped server')
    }
    await this.client.startInstances({
      InstanceIds: [this.currentServerDetails.instanceId],
    })
    const abortController = new AbortController()
    const status = await this.waitForStatus(async () => {
      const serverStatus = await this.getServerStatus(this.currentServerDetails.instanceId)
      return [serverStatus.stableStatus, serverStatus]
    }, abortController.signal)
    if (status[1]?.ipAddress) {
      return { state: 'running', instanceId: this.currentServerDetails.instanceId, ipAddress: status[1].ipAddress }
    }
    logger.warn({ status }, 'failed to wait for server')
    throw new Error('tried to start server, but failed')
  }

  public async stopServer(): Promise<AwsServerDetails & { state: 'stopping' }> {
    logger.info('stopping aws instance')
    if (this.currentServerDetails.state !== 'running') {
      throw new Error("can't stop a server not running")
    }
    // terminate here means stop
    await this.client.stopInstances({
      InstanceIds: [this.currentServerDetails.instanceId],
    })
    return {
      state: 'stopping',
      instanceId: this.currentServerDetails.instanceId,
      ipAddress: this.currentServerDetails.ipAddress,
    }
  }

  public cancelStoppingServer(): Promise<AwsServerDetails & { state: 'running' }> {
    throw new Error('Method not implemented.')
  }

  private async getServerStatus(instanceId: string): Promise<InstanceStatus> {
    const describeResponse = await this.client.describeInstances({
      InstanceIds: [instanceId],
    })
    const instanceDetails = describeResponse.Reservations?.[0].Instances?.[0] || null
    if (!instanceDetails) {
      throw new Error(`could not find the aws instance ${instanceId}`)
    }
    const status: InstanceStatus = {
      ipAddress: instanceDetails.PublicIpAddress || null,
      ec2Status: (instanceDetails.State?.Name as InstanceStateName | undefined) || null,
      spotStatus: null,
      stableStatus: false,
    }
    if (instanceDetails.State === 'stopped' && instanceDetails.SpotInstanceRequestId) {
      const spotResponse = await this.client.describeSpotInstanceRequests({
        SpotInstanceRequestIds: [instanceDetails.SpotInstanceRequestId],
      })
      status.spotStatus = (spotResponse.SpotInstanceRequests?.[0].State as SpotInstanceState | undefined) || null
    }
    if (status.ec2Status === 'running' || status.ec2Status === 'terminated') {
      status.stableStatus = true
    } else if (status.ec2Status === 'stopped') {
      status.stableStatus = status.spotStatus === 'open' // TODO
    } else {
      status.stableStatus = false
    }
    logger.info({ status }, 'status of started machine')
    return status
  }

  public async getStatusOfStoppingServer(): Promise<AwsServerDetails & { state: 'stopping' | 'stopped' }> {
    if (this.currentServerDetails.state === 'running') {
      throw new Error("can't stopping status of running server")
    }
    if (this.currentServerDetails.state !== 'stopping') {
      return this.currentServerDetails
    }
    const status = await this.getServerStatus(this.currentServerDetails.instanceId)
    const state = status.stableStatus && status.ec2Status === 'stopped' ? 'stopped' : 'stopping'
    if (state === 'stopping') {
      return this.currentServerDetails
    }
    return {
      state,
      instanceId: this.currentServerDetails.instanceId,
    }
  }

  public finalizeAfterStopping(_stoppingState: AwsServerDetails & { state: 'stopping' }): Promise<void> {
    return Promise.resolve()
  }
}
