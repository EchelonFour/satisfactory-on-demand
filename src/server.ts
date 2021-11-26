import globalLogger from "./logger.js"

const logger = globalLogger.child({ module: 'sessions' })

export class ServerManager {
  protected currentState: 'uninitilised' | 'running' | 'snapshotting' | 'stopped' = 'uninitilised'
  protected snapshotId: string | null = null
  protected ipAddress: string | null = null

  public async start(): Promise<string> {
    logger.info('starting server')
    this.ipAddress = '192.168.1.34'
    this.currentState = 'running'
    return this.ipAddress
  }

  public async shutdown() {
    logger.info('shutting down')
    logger.info('snapshotting')
    this.currentState = 'stopped'
  }

  public async loadCurrentState() {
    logger.info('loading state from api')
    //TODO
    this.currentState = 'stopped'
  }
}