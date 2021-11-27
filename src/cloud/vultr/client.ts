import { ServerDetails, ServerManager, SnapshotDetails } from '../../server'

export interface VultrServerDetails extends ServerDetails {
  instanceId: string
}
export interface VultrSnapshotDetails extends SnapshotDetails {
  snapshotId: string
}

export class VultrManager extends ServerManager<VultrServerDetails, VultrSnapshotDetails> {
  public getServerStatus(name: string): Promise<VultrServerDetails> {
    throw new Error('Method not implemented.')
  }

  public getSnapshotStatus(name: string): Promise<VultrSnapshotDetails> {
    throw new Error('Method not implemented.')
  }

  public startServerFromSnapshot(snapshot: VultrSnapshotDetails): Promise<VultrServerDetails> {
    throw new Error('Method not implemented.')
  }

  public stopServer(server: VultrServerDetails): Promise<VultrServerDetails> {
    throw new Error('Method not implemented.')
  }

  public snapshotServer(server: VultrServerDetails): Promise<VultrSnapshotDetails> {
    throw new Error('Method not implemented.')
  }

  public terminateServer(server: VultrServerDetails): Promise<VultrServerDetails> {
    throw new Error('Method not implemented.')
  }

  public waitForSnapshotToComplete(snapshot: VultrSnapshotDetails): Promise<VultrSnapshotDetails> {
    throw new Error('Method not implemented.')
  }

  public deleteSnapshot(snapshot: VultrSnapshotDetails): Promise<VultrSnapshotDetails> {
    throw new Error('Method not implemented.')
  }
}
