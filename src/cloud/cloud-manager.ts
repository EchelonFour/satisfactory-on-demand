import {
  catchError,
  filter,
  firstValueFrom,
  fromEvent,
  interval,
  map,
  mapTo,
  merge,
  of,
  switchMap,
  timeout,
} from 'rxjs'
import { AbortController, AbortSignal } from 'node-abort-controller'
import globalLogger from '../logger.js'

const logger = globalLogger.child({ module: 'sessions' })

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
  ipAddress: null
}
export interface ServerDetailsUninitialised {
  state: 'uninitialised'
}

export abstract class CloudManager<TServerDetails extends ServerDetails = ServerDetails> {
  #currentServerDetails!: TServerDetails

  public get currentServerDetails(): TServerDetails {
    return this.#currentServerDetails
  }

  private initilised = false

  protected cancelStoppingController: AbortController | null = null

  constructor(protected nameOfServer: string, protected nameOfSnapshot: string) {}

  private checkIfUninitialised(): void {
    if (!this.initilised) {
      throw new Error("tried to manage cloud server state, but the manager hasn't been initialised")
    }
  }

  public async start(): Promise<string> {
    this.checkIfUninitialised()
    logger.info('starting server')
    if (this.#currentServerDetails.state === 'running') {
      logger.warn('server tried to start, but it was already fine. ignoring')
      return this.#currentServerDetails.ipAddress
    }
    if (this.#currentServerDetails.state === 'stopping') {
      // if the server is still snapshotting, dont start a new one
      this.cancelStoppingController?.abort()
      this.#currentServerDetails = await this.cancelStoppingServer()
      this.cancelStoppingController = null
    }
    if (this.#currentServerDetails.state === 'stopped') {
      this.#currentServerDetails = await this.startServer()
    }
    if (this.#currentServerDetails.ipAddress == null) {
      throw new Error('running server has no ip address')
    }
    return this.#currentServerDetails.ipAddress
  }

  public async shutdown(): Promise<void> {
    this.checkIfUninitialised()
    if (this.#currentServerDetails.state === 'stopped' || this.#currentServerDetails.state === 'stopping') {
      logger.warn('tried to double shutdown. just aborting')
      return
    }
    logger.info('stopping server')
    this.#currentServerDetails = await this.stopServer()
    await this.trackStoppingServer()
  }

  protected async trackStoppingServer(): Promise<void> {
    this.checkIfUninitialised()
    const stoppingStatus = this.#currentServerDetails as TServerDetails & { state: 'stopping' }
    if (stoppingStatus.state !== 'stopping') {
      throw new Error('cannot track stopping server if it is not stopping')
    }
    this.cancelStoppingController = new AbortController()
    const [status, stoppedStatus] = await this.waitForStatus(async () => {
      const stoppingServerDetails = await this.getStatusOfStoppingServer()
      return [stoppingServerDetails.state === 'stopped', stoppingServerDetails]
    }, this.cancelStoppingController.signal)
    //do not handle aborts
    if (status.succeeded && stoppedStatus) {
      await this.finalizeAfterStopping(stoppingStatus)
      this.#currentServerDetails = stoppedStatus
      logger.info('server stopped')
    } else if (status.timedOut) {
      throw new Error('could not stop server. took too long and timed out')
    }
  }

  public async loadCurrentState(): Promise<void> {
    logger.info('loading state from api')
    this.#currentServerDetails = await this.getColdStatus(this.nameOfServer, this.nameOfSnapshot)
    logger.info(`figured the current server state is ${this.#currentServerDetails.state}`)
    this.initilised = true
    if (this.#currentServerDetails.state === 'stopping') {
      logger.info('server found stopping on boot')
      void this.trackStoppingServer() //discard the promise for this on purpose
    }
  }

  protected async waitForStatus<TFinalStatus>(
    getStatus: () => Promise<[boolean, TFinalStatus | null]>,
    abort?: AbortSignal,
  ): Promise<readonly [{ aborted: boolean; timedOut: boolean; succeeded: boolean }, TFinalStatus | null]> {
    const retryDelayMs = 3000
    const timeoutMs = 1000 * 60 * 20
    const cancelled = abort
      ? fromEvent(abort, 'abort').pipe(mapTo([{ aborted: true, timedOut: false, succeeded: false }, null] as const))
      : of() // uncancellable
    const statusSucceeded = interval(retryDelayMs).pipe(
      switchMap(() => getStatus()),
      // eslint-disable-next-line promise/prefer-await-to-callbacks -- this ain't a promise
      catchError((error) => {
        logger.error({ error }, 'failed to get the status')
        return of([false, null] as const)
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
    return firstValueFrom(merge(statusSucceeded, cancelled))
  }

  public abstract getColdStatus(instanceName: string, snapshotName: string): Promise<TServerDetails>
  public abstract startServer(): Promise<TServerDetails & { state: 'running' }>
  public abstract stopServer(): Promise<TServerDetails & { state: 'stopping' }>
  public abstract cancelStoppingServer(): Promise<TServerDetails & { state: 'running' }>
  public abstract getStatusOfStoppingServer(): Promise<TServerDetails & { state: 'stopping' | 'stopped' }>
  public abstract finalizeAfterStopping(stoppingState: TServerDetails & { state: 'stopping' }): Promise<void>
}
