import globalLogger from './logger.js'

const logger = globalLogger.child({ module: 'sessions' })

export interface ServerDetails {
  state: 'missing' | 'stopped' | 'running'
  ipAddress: string
}

export interface SnapshotDetails {
  state: 'missing' | 'pending' | 'complete'
}

export abstract class ServerManager<
  TServerDetails extends ServerDetails = ServerDetails,
  TSnapshotDetails extends SnapshotDetails = SnapshotDetails,
> {
  protected currentState: 'uninitialised' | 'running' | 'snapshotting' | 'stopped' = 'uninitialised'

  protected currentServerDetails!: TServerDetails

  protected currentSnapshotDetails!: TSnapshotDetails

  constructor(protected nameOfServer: string, protected nameOfSnapshot: string) {}

  private errorIfUninitialised(): void {
    if (this.currentState === 'uninitialised') {
      throw new Error("tried to manage cloud server state, but the manager hasn't been initialised")
    }
  }

  public async start(): Promise<string> {
    this.errorIfUninitialised()
    logger.info('starting server')
    this.currentServerDetails = await this.startServerFromSnapshot(this.currentSnapshotDetails)
    this.currentState = 'running'
    return this.currentServerDetails.ipAddress
  }

  public async shutdown() {
    this.errorIfUninitialised()
    logger.info('shutting down')
    this.currentServerDetails = await this.stopServer(this.currentServerDetails)
    logger.info('snapshotting')
    await this.rotateSnapshots()
    this.currentServerDetails = await this.terminateServer(this.currentServerDetails)
    this.currentState = 'stopped'
  }

  protected async rotateSnapshots() {
    const oldSnapshot = this.currentSnapshotDetails
    this.currentSnapshotDetails = await this.snapshotServer(this.currentServerDetails)
    this.currentSnapshotDetails = await this.waitForSnapshotToComplete(this.currentSnapshotDetails)
    if (oldSnapshot.state === 'pending' || oldSnapshot.state === 'complete') {
      logger.info('we have a new snapshot, deleting old one')
      await this.deleteSnapshot(oldSnapshot)
    }
  }

  public async loadCurrentState() {
    logger.info('loading state from api')
    this.currentServerDetails = await this.getServerStatus(this.nameOfServer)
    this.currentSnapshotDetails = await this.getSnapshotStatus(this.nameOfSnapshot)
    if (this.currentServerDetails.state === 'running') {
      if (this.currentSnapshotDetails.state === 'complete' || this.currentSnapshotDetails.state === 'pending') {
        logger.warn('there was a snapshot even though the server is running, deleting')
        this.currentSnapshotDetails = await this.deleteSnapshot(this.currentSnapshotDetails)
      }
      this.currentState = 'running'
    } else if (this.currentServerDetails.state === 'missing') {
      if (this.currentSnapshotDetails.state === 'missing') {
        throw new Error('can not find a server or snapshot, so nothing to boot for the user')
      } else if (this.currentSnapshotDetails.state === 'pending') {
        logger.warn('snapshot still pending when loading, going to wait for it to complete')
        this.currentSnapshotDetails = await this.waitForSnapshotToComplete(this.currentSnapshotDetails)
      }
      this.currentState = 'stopped'
    } else if (this.currentServerDetails.state === 'stopped') {
      this.currentState = 'snapshotting'
      logger.warn('server exists, but is stopped')
      await this.rotateSnapshots()
      this.currentServerDetails = await this.terminateServer(this.currentServerDetails)
      this.currentState = 'stopped'
    }

    // no idea how we could trip this, but just keeping myself sane
    this.errorIfUninitialised()
  }
  public abstract getServerStatus(name: string): Promise<TServerDetails>
  public abstract getSnapshotStatus(name: string): Promise<TSnapshotDetails>
  public abstract startServerFromSnapshot(snapshot: TSnapshotDetails): Promise<TServerDetails>
  public abstract stopServer(server: TServerDetails): Promise<TServerDetails>
  public abstract snapshotServer(server: TServerDetails): Promise<TSnapshotDetails>
  public abstract terminateServer(server: TServerDetails): Promise<TServerDetails>
  public abstract waitForSnapshotToComplete(snapshot: TSnapshotDetails): Promise<TSnapshotDetails>
  public abstract deleteSnapshot(snapshot: TSnapshotDetails): Promise<TSnapshotDetails>
}
