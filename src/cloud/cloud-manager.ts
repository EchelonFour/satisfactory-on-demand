import {
  filter,
  firstValueFrom,
  fromEvent,
  interval,
  map,
  mapTo,
  merge,
  mergeMap,
  of,
  ReplaySubject,
  timeout,
} from 'rxjs'
import { AbortController, AbortSignal } from 'node-abort-controller'
import globalLogger from '../logger.js'

const logger = globalLogger.child({ module: 'cloud' })

export type ServerDetails = ServerDetailsRunning | ServerDetailsStopping | ServerDetailsStopped

export interface ServerDetailsRunning {
  state: 'running'
  ipAddress: string
}
export interface ServerDetailsStopping {
  state: 'stopping'
  ipAddress: string
}
export interface ServerDetailsStopped {
  state: 'stopped'
}

export abstract class CloudManager<TServerDetails extends ServerDetails = ServerDetails> {
  #currentServerDetails!: TServerDetails

  #currentState: ReplaySubject<ServerDetails> = new ReplaySubject<ServerDetails>(1)

  public get currentServerDetails(): TServerDetails {
    return this.#currentServerDetails
  }

  private set currentServerDetails(value: TServerDetails) {
    this.#currentServerDetails = value
    this.#currentState.next(value)
  }

  public readonly currentServerDetails$ = this.#currentState.asObservable()

  private initilised = false

  protected cancelStoppingController: AbortController | null = null

  constructor(protected nameOfServer: string, protected nameOfSnapshot: string) {}

  private checkIfUninitialised(): void {
    if (!this.initilised) {
      throw new Error("tried to manage cloud server state, but the manager hasn't been initialised")
    }
  }

  public async start(): Promise<void> {
    this.checkIfUninitialised()
    logger.info('starting server')
    if (this.currentServerDetails.state === 'running') {
      logger.warn('server tried to start, but it was already fine. ignoring')
      return
    }
    if (this.currentServerDetails.state === 'stopping') {
      // if the server is still snapshotting, dont start a new one
      this.cancelStoppingController?.abort()
      try {
        this.currentServerDetails = await this.cancelStoppingServer()
      } catch (error) {
        logger.warn(error, 'failed to cancel a stopping server. Will wait for it to stop completely and start it again')
        await this.trackStoppingServer()
      }
      this.cancelStoppingController = null
    }
    if (this.currentServerDetails.state === 'stopped') {
      this.currentServerDetails = await this.startServer()
    }
    if (this.currentServerDetails.state !== 'running') {
      throw new Error('could not start the server')
    }
  }

  public async shutdown(): Promise<void> {
    this.checkIfUninitialised()
    if (this.currentServerDetails.state === 'stopped' || this.currentServerDetails.state === 'stopping') {
      logger.warn('tried to double shutdown. just aborting')
      return
    }
    logger.info('stopping server')
    this.currentServerDetails = await this.stopServer()
    await this.trackStoppingServer()
  }

  protected async trackStoppingServer(): Promise<void> {
    this.checkIfUninitialised()
    const stoppingStatus = this.currentServerDetails as TServerDetails & { state: 'stopping' }
    if (stoppingStatus.state !== 'stopping') {
      throw new Error('cannot track stopping server if it is not stopping')
    }
    this.cancelStoppingController = new AbortController()
    const [status, stoppedStatus] = await this.waitForStatus(async () => {
      logger.debug('getting status of stopping server')
      const stoppingServerDetails = await this.getStatusOfStoppingServer()
      return [stoppingServerDetails.state === 'stopped', stoppingServerDetails]
    }, this.cancelStoppingController.signal)
    //do not handle aborts
    if (status.succeeded && stoppedStatus) {
      await this.finalizeAfterStopping(stoppingStatus)
      this.currentServerDetails = stoppedStatus
      logger.info('server stopped')
    } else if (status.timedOut) {
      throw new Error('could not stop server. took too long and timed out')
    }
  }

  public async loadCurrentState(): Promise<void> {
    logger.info('loading state from api')
    this.currentServerDetails = await this.getColdStatus(this.nameOfServer, this.nameOfSnapshot)
    logger.info(`figured the current server state is ${this.currentServerDetails.state}`)
    this.initilised = true
    if (this.currentServerDetails.state === 'stopping') {
      logger.info('server found stopping on boot')
      void this.trackStoppingServer() //discard the promise for this on purpose
    }
  }

  protected async waitForStatus<TFinalStatus>(
    getStatus: () => Promise<readonly [boolean, TFinalStatus | null]>,
    abort?: AbortSignal,
  ): Promise<readonly [{ aborted: boolean; timedOut: boolean; succeeded: boolean }, TFinalStatus | null]> {
    const retryDelayMs = 3000
    // eslint-disable-next-line @typescript-eslint/no-magic-numbers
    const timeoutMs = 1000 * 60 * 20
    const cancelled = abort
      ? fromEvent(abort, 'abort').pipe(mapTo([{ aborted: true, timedOut: false, succeeded: false }, null] as const))
      : of() // uncancellable
    const statusSucceeded = interval(retryDelayMs).pipe(
      mergeMap(async () => {
        try {
          logger.debug('trying to get status')
          return await getStatus()
        } catch (error) {
          logger.error({ error }, 'failed to get the status')
          return [false, null] as const
        }
      }),
      filter((complete) => complete[0]),
      map((succeeded) => [{ aborted: false, timedOut: false, succeeded: succeeded[0] }, succeeded[1]] as const),
      timeout({
        each: timeoutMs,
        with: () => {
          logger.error('failed to check expected status')
          return of([{ aborted: false, timedOut: true, succeeded: false }, null] as const)
        },
      }),
    )
    const result = await firstValueFrom(merge(statusSucceeded, cancelled))
    logger.debug({ result }, 'result of waiting for status change')
    return result
  }

  public abstract getColdStatus(instanceName: string, snapshotName: string): Promise<TServerDetails>
  public abstract startServer(): Promise<TServerDetails & { state: 'running' }>
  public abstract stopServer(): Promise<TServerDetails & { state: 'stopping' }>
  public abstract cancelStoppingServer(): Promise<TServerDetails & { state: 'running' }>
  public abstract getStatusOfStoppingServer(): Promise<TServerDetails & { state: 'stopping' | 'stopped' }>
  public abstract finalizeAfterStopping(stoppingState: TServerDetails & { state: 'stopping' }): Promise<void>
}
