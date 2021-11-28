import globalLogger from '../logger.js'
import { wait } from '../util.js'

const logger = globalLogger.child({ module: 'sessions' })

export interface ServerDetails {
  state: 'missing' | 'running'
  ipAddress: string | null
}

export interface SnapshotDetails {
  state: 'missing' | 'pending' | 'complete'
}

export abstract class CloudManager<
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
    if (this.currentState === 'running') {
      logger.warn('server tried to start, but it was already fine. ignoring')
      return this.currentServerDetails.ipAddress!
    }
    if (this.currentState === 'stopped') {
      // if the server is still snapshotting, dont start a new one
      this.currentServerDetails = await this.startServerFromSnapshot(this.currentSnapshotDetails)
    }
    this.currentState = 'running'
    if (this.currentServerDetails.ipAddress == null) {
      throw new Error('running server has no ip address')
    }
    return this.currentServerDetails.ipAddress
  }

  public async shutdown() {
    this.errorIfUninitialised()
    if (this.currentState === 'stopped') {
      logger.warn('tried to double shutdown. just aborting')
      return
    } 
    this.currentState = 'snapshotting'
    logger.info('snapshotting')
    await this.rotateSnapshots()
    //@ts-ignore -- ts thinks it knows, but other threads might change this variable
    if (this.currentState !== 'running') {
      // if we are here, the snapshot did not get cancelled
      logger.info('terminating')
      this.currentServerDetails = await this.terminateServer(this.currentServerDetails)
      this.currentState = 'stopped'
    }

  }

  protected async rotateSnapshots() {
    const oldSnapshot = this.currentSnapshotDetails
    logger.info('snapshot starting')
    let newSnapshot = await this.snapshotServer(this.currentServerDetails)
    const waitDurationMs = 20000
    const totalWaitCycles = 1000 * 60 * 30 / waitDurationMs // 1000ms * 1 minute * 30 minutes
    let currentWaitCycles = 0
    while(newSnapshot.state === 'pending' && currentWaitCycles < totalWaitCycles) {
      currentWaitCycles++
      logger.debug({waitCycle: currentWaitCycles}, 'waiting for snapshot to complete')
      await wait(waitDurationMs)
      newSnapshot = await this.updateSnapshotStatus(newSnapshot)
    }
    logger.info(`snapshot took about ${currentWaitCycles * 20} seconds`)
    this.currentSnapshotDetails = newSnapshot
    if (oldSnapshot.state === 'pending' || oldSnapshot.state === 'complete') {
      logger.info({oldSnapshot}, 'we have a new snapshot, deleting old one')
      await this.deleteSnapshot(oldSnapshot)
    }
  }

  public async loadCurrentState() {
    logger.info('loading state from api');
    [this.currentServerDetails, this.currentSnapshotDetails] = await this.getColdStatus(this.nameOfServer, this.nameOfSnapshot)
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
        throw new Error('snapshot still pending when loading, there should not be a single pending snapshot with no server')
      }
      this.currentState = 'stopped'
    } else if (this.currentServerDetails.state === 'stopped') {
      this.currentState = 'snapshotting'
      logger.warn('server exists, but is stopped')
      await this.rotateSnapshots()
      this.currentServerDetails = await this.terminateServer(this.currentServerDetails)
      this.currentState = 'stopped'
    }
    logger.info(`figured the current server state is ${this.currentState}`)

    // no idea how we could trip this, but just keeping myself sane
    this.errorIfUninitialised()
  }
  public abstract getColdStatus(instanceName: string, snapshotName: string): Promise<[TServerDetails, TSnapshotDetails]>
  public abstract startServerFromSnapshot(snapshot: TSnapshotDetails): Promise<TServerDetails>
  public abstract snapshotServer(server: TServerDetails): Promise<TSnapshotDetails>
  public abstract terminateServer(server: TServerDetails): Promise<TServerDetails>
  public abstract updateSnapshotStatus(snapshot: TSnapshotDetails): Promise<TSnapshotDetails>
  public abstract deleteSnapshot(snapshot: TSnapshotDetails): Promise<TSnapshotDetails>
}
