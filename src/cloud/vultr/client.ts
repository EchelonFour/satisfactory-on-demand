import axios, { AxiosInstance } from 'axios'
import { CloudManager, ServerDetailsRunning, ServerDetailsStopped, ServerDetailsStopping } from '../cloud-manager.js'
import globalLogger from '../../logger.js'
import { VultrCloudManagerConfig, VultrCloudManagerConfigAsDefined } from './config.js'

const logger = globalLogger.child({ module: 'vultr' })

export type VultrServerDetails =
  | (ServerDetailsStopped & {
      snapshotId: string
    })
  | (ServerDetailsRunning & {
      instanceId: string
      snapshotId: string
    })
  | (ServerDetailsStopping & {
      instanceId: string
      snapshotId: string
      oldSnapshotId: string
    })

interface VultrSnapshotData {
  id: string
  status: 'pending' | 'complete' | 'deleted'
  description: string
}
interface VultrSnapshotResponse {
  snapshot: VultrSnapshotData
}
interface VultrSnapshotsResponse {
  snapshots: VultrSnapshotData[]
}
interface VultrInstanceData {
  id: string
  main_ip: string
  status: 'pending' | 'active'
  power_status: 'running' | 'stopped'
  server_status: 'ok' | 'none' | 'installingbooting'
  label: string
}
interface VultrInstanceResponse {
  instance: VultrInstanceData
}
interface VultrInstancesResponse {
  instances: VultrInstanceData[]
}
export class VultrManager extends CloudManager<VultrServerDetails> {
  private axios: AxiosInstance

  private defaultCreateObject: Record<string, unknown>

  constructor(nameOfServer: string, nameOfSnapshot: string, protected config: VultrCloudManagerConfig) {
    super(nameOfServer, nameOfSnapshot)
    VultrManager.validateConfig(config)
    this.axios = axios.create({
      baseURL: 'https://api.vultr.com/v2/',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
    })
    this.defaultCreateObject = config.extendedJsonOptions
      ? (JSON.parse(config.extendedJsonOptions) as Record<string, unknown>)
      : {}
  }

  public static validateConfig(config: VultrCloudManagerConfigAsDefined): VultrCloudManagerConfig {
    if (!config.apiKey) {
      throw new Error('vultr needs an api key and none is defined')
    }
    if (!config.plan) {
      throw new Error('vultr needs a plan and none is defined')
    }
    if (!config.region) {
      throw new Error('vultr needs a region and none is defined')
    }
    if (!config.sshKey) {
      throw new Error('vultr needs a ssh and none is defined')
    }
    return config as VultrCloudManagerConfig
  }

  public async getColdStatus(instanceName: string, snapshotName: string): Promise<VultrServerDetails> {
    const [server, snapshot] = await Promise.all([
      this.getServerStatus(instanceName),
      this.getSnapshotStatus(snapshotName),
    ])
    if (server?.power_status === 'running' && snapshot?.status === 'complete') {
      return {
        state: 'running',
        instanceId: server.id,
        snapshotId: snapshot.id,
        ipAddress: server.main_ip,
      }
    }
    if (!server && snapshot?.status === 'complete') {
      return {
        state: 'stopped',
        snapshotId: snapshot.id,
        ipAddress: null,
      }
    }
    throw new Error('cannot recover vultr from the current state')
  }

  public async getServerStatus(name: string): Promise<VultrInstanceData | null> {
    const response = await this.axios.get<VultrInstancesResponse>('instances')
    const validInstances = response.data.instances.filter((instance) => instance.label === name)
    if (validInstances.length === 0) {
      return null
    }
    if (validInstances.length > 1) {
      throw new Error('multiple instances found, impossible to tell which one to use')
    }
    if (validInstances[0].power_status !== 'running') {
      throw new Error("found a server, but it isn't running")
    }
    return validInstances[0]
  }

  public async getSnapshotStatus(name: string): Promise<VultrSnapshotData | null> {
    const response = await this.axios.get<VultrSnapshotsResponse>('snapshots')
    const validSnapshots = response.data.snapshots.filter(
      (snap) => (snap.status === 'complete' || snap.status === 'pending') && snap.description === name,
    )
    if (validSnapshots.length === 0) {
      logger.warn('no snapshot found on load')
      return null
    }
    if (validSnapshots.length > 1) {
      throw new Error('multiple snapshots found, impossible to tell which one to use')
    }
    return validSnapshots[0]
  }

  public async startServer(): Promise<VultrServerDetails & { state: 'running' }> {
    if (this.currentServerDetails.state !== 'stopped') {
      throw new Error('cannot start server that is not stopped')
    }
    const createRequest = {
      ...this.defaultCreateObject,
      label: this.nameOfServer,
      snapshot_id: this.currentServerDetails.snapshotId,
      region: this.config.region,
      plan: this.config.plan,
      sshkey_id: this.config.sshKey,
      hostname: this.config.hostname,
    }
    const response = await this.axios.post<VultrInstanceResponse>('instances', createRequest)
    //TODO wait
    return {
      state: 'running',
      ipAddress: response.data.instance.main_ip,
      instanceId: response.data.instance.id,
      snapshotId: this.currentServerDetails.snapshotId,
    }
  }

  public async stopServer(): Promise<VultrServerDetails & { state: 'stopping' }> {
    if (this.currentServerDetails.state !== 'running') {
      throw new Error('cannot stop server not running')
    }
    const response = await this.axios.post<VultrSnapshotResponse>('snapshots', {
      instance_id: this.currentServerDetails.instanceId,
      description: this.nameOfSnapshot,
    })
    if (response.data.snapshot.status === 'pending' || response.data.snapshot.status === 'complete') {
      return {
        state: 'stopping',
        instanceId: this.currentServerDetails.instanceId,
        snapshotId: response.data.snapshot.id,
        ipAddress: this.currentServerDetails.ipAddress,
        oldSnapshotId: this.currentServerDetails.snapshotId,
      }
    }
    throw new Error(`snap was made with unknown state "${response.data.snapshot.status}""`)
  }

  public async cancelStoppingServer(): Promise<VultrServerDetails & { state: 'running' }> {
    if (this.currentServerDetails.state !== 'stopping') {
      throw new Error('cannot cancel stopping if server is not stopping')
    }
    await this.axios.delete(`snapshots/${this.currentServerDetails.snapshotId}`)
    return {
      state: 'running',
      snapshotId: this.currentServerDetails.oldSnapshotId,
      instanceId: this.currentServerDetails.instanceId,
      ipAddress: this.currentServerDetails.ipAddress,
    }
  }

  public async getStatusOfStoppingServer(): Promise<VultrServerDetails & { state: 'stopped' | 'stopping' }> {
    if (this.currentServerDetails.state !== 'stopping') {
      throw new Error('cannot get status of a server not stopping')
    }
    const response = await this.axios.get<VultrSnapshotResponse>(`snapshots/${this.currentServerDetails.snapshotId}`)
    if (response.data.snapshot.status === 'pending') {
      return this.currentServerDetails
    }
    if (response.data.snapshot.status === 'complete') {
      return {
        state: 'stopped',
        snapshotId: this.currentServerDetails.snapshotId,
        ipAddress: null,
      }
    }
    throw new Error(`snap was made with unknown state "${response.data.snapshot.status}"`)
  }

  public async finalizeAfterStopping(stoppingState: VultrServerDetails & { state: 'stopping' }): Promise<void> {
    await this.axios.delete(`instances/${stoppingState.instanceId}`)
    await this.axios.delete(`snapshots/${stoppingState.oldSnapshotId}`)
  }
}
