import { ServerDetails, CloudManager, SnapshotDetails } from '../cloud-manager.js'
import globalLogger from '../../logger.js'
import { EC2, EC2ClientConfig, Instance } from '@aws-sdk/client-ec2';
import { wait } from '../../util.js';
import { AwsCloudManagerConfig } from './config.js';

const logger = globalLogger.child({ module: 'aws' })

export interface AwsServerDetails extends ServerDetails {
  instanceId: string | null
}
export interface AwsSnapshotDetails extends SnapshotDetails {
  instanceId: string | null
}

export class AwsManager extends CloudManager<AwsServerDetails, AwsSnapshotDetails> {
  private client: EC2
  constructor(nameOfServer: string, nameOfSnapshot: string, config: AwsCloudManagerConfig) {
    super(nameOfServer, nameOfSnapshot)
    const ec2Config: EC2ClientConfig = { logger }
    if (config.region) {
      ec2Config.region = config.region
    }
    if (config.accessKeyId && config.secretAccessKey) {
      ec2Config.credentials = {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      }
    }
    this.client = new EC2(ec2Config);
  }

  public async getColdStatus(instanceName: string, snapshotName: string): Promise<[AwsServerDetails, AwsSnapshotDetails]> {
    const existingServers = await this.client.describeInstances({
      Filters: [
        {
          Name: 'tag:Name',
          Values: [instanceName || snapshotName]
        },
        {
          Name: 'instance-state-name',
          Values: ['pending', 'running', 'shutting-down', 'stopping', 'stopped'] // not terminated
        }
      ]
    })
    const allInstances = existingServers.Reservations?.flatMap((reservation) => reservation.Instances!).filter((i) => i !== undefined)!
    if (!allInstances || allInstances.length === 0) {
      throw new Error('could not find a server to manage in ec2')
    } else if (allInstances.length > 1) {
      throw new Error('too many servers found in ec2. Unable to determine correct one to manage')
    }
    const managedInstance = allInstances[0]
    logger.info(`managing the instance with id: ${managedInstance.InstanceId}`)
    if (managedInstance.State?.Name === 'running' || managedInstance.State?.Name === 'pending') {
      return [{ state: 'running', instanceId: managedInstance.InstanceId!, ipAddress: managedInstance.PublicIpAddress!}, {state: 'missing', instanceId: null}]
    }
    return [{ state: 'missing', instanceId: null, ipAddress: null}, {state: 'complete', instanceId: managedInstance.InstanceId!}]
  }
  public async startServerFromSnapshot(snapshot: AwsSnapshotDetails): Promise<AwsServerDetails> {
    logger.info('starting aws instance')
    const response = await this.client.startInstances({
      InstanceIds: [snapshot.instanceId!]
    })
    let knownIp: string | null = null
    let mostRecentDescribe: Instance
    while (knownIp === null) {
      //TODO add a timeout
      await wait(1500)
      const describeResponse = await this.client.describeInstances({
        InstanceIds: [snapshot.instanceId!]
      })
      mostRecentDescribe = describeResponse.Reservations?.[0].Instances?.[0]!
      logger.info({ip: mostRecentDescribe.PublicIpAddress, state: mostRecentDescribe.State?.Name}, 'status of started machine')
      knownIp = mostRecentDescribe?.PublicIpAddress || null
    }
    return { state: 'running', ipAddress: knownIp, instanceId: snapshot.instanceId }
  }
  public async snapshotServer(server: AwsServerDetails): Promise<AwsSnapshotDetails> {
    // this system doesn't snapshot, it just stops and starts. so we just save a marker of the stopped instance for the ID
    return { state: 'complete', instanceId: server.instanceId }
  }
  public async terminateServer(server: AwsServerDetails): Promise<AwsServerDetails> {
    logger.info('stopping aws instance')
    // terminate here means stop
    await this.client.stopInstances({
      InstanceIds: [server.instanceId!]
    })
    return { state: 'missing', instanceId: null, ipAddress: null }
  }
  public updateSnapshotStatus(snapshot: AwsSnapshotDetails): Promise<AwsSnapshotDetails> {
    // noop because no snapshots are ever pending
    return Promise.resolve(snapshot)
  }
  public deleteSnapshot(snapshot: AwsSnapshotDetails): Promise<AwsSnapshotDetails> {
    // noop
    return Promise.resolve({ state: 'missing', instanceId: snapshot.instanceId })
  }


}
