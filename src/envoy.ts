import { execa, ExecaChildProcess } from 'execa'
import { EnvoyConfigBuilder } from './envoy-config-builder.js'
import globalLogger from './logger.js'

const logger = globalLogger.child({ module: 'envoy' })

export class EnvoyManager {
  protected child: ExecaChildProcess | null = null

  protected currentIpAddress = '127.0.0.1'

  protected configBuilder = new EnvoyConfigBuilder()

  public async setToNewIp(ipAddress: string): Promise<void> {
    this.currentIpAddress = ipAddress
    await this.stop()
    this.start()
  }

  public start(): void {
    logger.info('starting envoy')
    this.child = execa('envoy', ['--config-yaml', this.configBuilder.getForIp(this.currentIpAddress)])
    //TODO pipe the lines into the logger
  }

  public async stop(): Promise<void> {
    if (!this.child) {
      return
    }
    logger.info('stopping envoy')
    this.child.cancel()
    await this.child
    logger.info('envoy stopped')
  }
}
