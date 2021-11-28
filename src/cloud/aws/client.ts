import { ServerDetails, ServerManager, SnapshotDetails } from '../../server'
import globalLogger from '../../logger'
import { EC2, EC2ClientConfig, Instance } from '@aws-sdk/client-ec2';
import { wait } from '../../util';

const logger = globalLogger.child({ module: 'aws' })

export interface AwsServerDetails extends ServerDetails {
  instanceId: string | null
}
export interface AwsSnapshotDetails extends SnapshotDetails {
  instanceId: string | null
}

export class AwsManager extends ServerManager<AwsServerDetails, AwsSnapshotDetails> {


  private client: EC2
  constructor(nameOfServer: string, nameOfSnapshot: string, region: string | null = null, accessKeyId: string | null = null, secretAccessKey: string | null = null) {
    super(nameOfServer, nameOfSnapshot)
    const config: EC2ClientConfig = {}
    if (region) {
      config.region = region
    }
    if (accessKeyId && secretAccessKey) {
      config.credentials = {
        accessKeyId,
        secretAccessKey,
      }
    }
    this.client = new EC2(config);
  }

  public async getColdStatus(instanceName: string, snapshotName: string): Promise<[AwsServerDetails, AwsSnapshotDetails]> {
    const existingServers = await this.client.describeInstances({
      Filters: [
        {
          Name: 'tag:Name',
          Values: [instanceName || snapshotName]
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
    if (managedInstance.State?.Name === 'running') {
      return [{ state: 'running', instanceId: managedInstance.InstanceId!, ipAddress: managedInstance.PublicIpAddress!}, {state: 'missing', instanceId: null}]
    }
    return [{ state: 'missing', instanceId: null, ipAddress: null}, {state: 'complete', instanceId: managedInstance.InstanceId!}]
  }
  public async startServerFromSnapshot(snapshot: AwsSnapshotDetails): Promise<AwsServerDetails> {
    const response = await this.client.startInstances({
      InstanceIds: [snapshot.instanceId!]
    })
    let currentState = response.StartingInstances?.[0].CurrentState?.Name
    let mostRecentDescribe: Instance
    while (currentState === 'pending') {
      await wait(1500)
      const describeResponse = await this.client.describeInstances({
        InstanceIds: [snapshot.instanceId!]
      })
      mostRecentDescribe = describeResponse.Reservations?.[0].Instances?.[0]!
      currentState = mostRecentDescribe?.State?.Name
    }
    if (currentState !== 'running') {
      throw new Error('failed to boot ec2 instance')
    }
    return { state: 'running', ipAddress: mostRecentDescribe!.PublicIpAddress!, instanceId: snapshot.instanceId }
  }
  public async snapshotServer(server: AwsServerDetails): Promise<AwsSnapshotDetails> {
    // this system doesn't snapshot, it just stops and starts. so we just save a marker of the stopped instance for the ID
    return { state: 'complete', instanceId: server.instanceId }
  }
  public async terminateServer(server: AwsServerDetails): Promise<AwsServerDetails> {
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
