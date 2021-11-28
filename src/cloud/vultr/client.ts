import { ServerDetails, ServerManager, SnapshotDetails } from '../../server'
import axios, { AxiosInstance } from 'axios'
import globalLogger from '../../logger'

const logger = globalLogger.child({ module: 'vultr' })

export interface VultrServerDetails extends ServerDetails {
  instanceId: string | null
}
export interface VultrSnapshotDetails extends SnapshotDetails {
  snapshotId: string | null
}

interface VultrSnapshotData {
  id: string
  status: 'pending' | 'complete' | 'deleted',
  description: string
}
interface VultrSnapshotResponse {
  snapshot: VultrSnapshotData
}
interface VultrSnapshotsResponse {
  snapshots: VultrSnapshotData[]
}
interface VultrInstanceData {
  id: string,
  main_ip: string,
  status: 'pending' | 'active',
  power_status: 'running' | 'stopped',
  server_status: 'ok' | 'none' | 'installingbooting',
  label: string
}
interface VultrInstanceResponse {
  instance: VultrInstanceData
}
interface VultrInstancesResponse {
  instances: VultrInstanceData[]
}
export class VultrManager extends ServerManager<VultrServerDetails, VultrSnapshotDetails> {
  private axios: AxiosInstance
  constructor(nameOfServer: string, nameOfSnapshot: string, apiKey: string) {
    super(nameOfServer, nameOfSnapshot)
    this.axios = axios.create({
      baseURL: 'https://api.vultr.com/v2/',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })
  }
  public async getServerStatus(name: string): Promise<VultrServerDetails> {
    const response = await this.axios.get<VultrInstancesResponse>('instances')
    const validInstances = response.data.instances.filter((instance) => instance.label === name)
    if (validInstances.length === 0) {
      return { state: 'missing', ipAddress: null, instanceId: null }
    } else if (validInstances.length > 1) {
      throw new Error('multiple instances found, impossible to tell which one to use')
    }
    const state = validInstances[0].power_status === 'running' ? 'running' : 'stopped'
    return { state, instanceId: validInstances[0].id, ipAddress: validInstances[0].main_ip }
  }

  public async getSnapshotStatus(name: string): Promise<VultrSnapshotDetails> {
    const response = await this.axios.get<VultrSnapshotsResponse>('snapshots')
    const validSnapshots = response.data.snapshots.filter((snap) => (snap.status === 'complete' || snap.status === 'pending') && snap.description === name)
    if (validSnapshots.length === 0) {
      logger.warn('no snapshot found on load')
      return { state: 'missing', snapshotId: null}
    } else if (validSnapshots.length > 1) {
      throw new Error('multiple snapshots found, impossible to tell which one to use')
    }
    return { state: validSnapshots[0].status as Exclude<VultrSnapshotData['status'], 'deleted'>, snapshotId: validSnapshots[0].id }
  }

  public async startServerFromSnapshot(snapshot: VultrSnapshotDetails): Promise<VultrServerDetails> {
    const response = await this.axios.post<VultrInstanceResponse>('instances', {
      label: this.nameOfServer,
      snapshot_id: snapshot.snapshotId,
      // TODO plan and region and other junk
    })
    return { state: 'running', ipAddress: response.data.instance.main_ip, instanceId: response.data.instance.id }
  }

  public async stopServer(server: VultrServerDetails): Promise<VultrServerDetails> {
    await this.axios.post('instances/halt', { instance_ids: [server.instanceId] })
    return { state: 'stopped', instanceId: server.instanceId, ipAddress: server.ipAddress }
  }

  public async snapshotServer(server: VultrServerDetails): Promise<VultrSnapshotDetails> {
    const response = await this.axios.post<VultrSnapshotResponse>('snapshots', {
      instance_id: server.instanceId,
      description: this.nameOfSnapshot,
    })
    if (response.data.snapshot.status === 'pending' || response.data.snapshot.status === 'complete') {
      return { snapshotId: response.data.snapshot.id, state: response.data.snapshot.status }
    }
    throw new Error(`snap was made with unknown state "${response.data.snapshot.status}""`)
  }

  public async terminateServer(server: VultrServerDetails): Promise<VultrServerDetails> {
    await this.axios.delete(`instances/${server.instanceId}`)
    return { state: 'missing', instanceId: null, ipAddress: null }
  }

  public async updateSnapshotStatus(snapshot: VultrSnapshotDetails): Promise<VultrSnapshotDetails> {
    const response = await this.axios.get<VultrSnapshotResponse>(`snapshots/${snapshot.snapshotId}`)
    if (response.data.snapshot.status === 'pending' || response.data.snapshot.status === 'complete') {
      return { snapshotId: response.data.snapshot.id, state: response.data.snapshot.status }
    }
    throw new Error(`snap was made with unknown state "${response.data.snapshot.status}""`)
  }

  public async deleteSnapshot(snapshot: VultrSnapshotDetails): Promise<VultrSnapshotDetails> {
    await this.axios.delete(`snapshots/${snapshot.snapshotId}`)
    return { state: 'missing', snapshotId: null }
  }
}
