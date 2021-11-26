import {execa, ExecaChildProcess} from 'execa'
import { readFileSync } from 'fs'

import config from './config.js'
import globalLogger from './logger.js'

const logger = globalLogger.child({ module: 'envoy' })

class EnvoyConfigBuilder {
  private templateContents: string;
  constructor(protected templateFile: string = config.get('envoyConfigTemplate')) {
    this.templateContents = readFileSync(templateFile, { encoding: 'utf8' })
  }

  public getForIp(ipAddress: string): string {
    return this.templateContents.replaceAll("{{IP}}", ipAddress)
  }
}
export class EnvoyManager {

  protected child: ExecaChildProcess | null = null
  protected currentIpAddress: string = "127.0.0.1"
  protected configBuilder = new EnvoyConfigBuilder()
  public async setToNewIp(ipAddress: string): Promise<void> {
    this.currentIpAddress = ipAddress
    await this.stop()
    this.start()
  }

  public start() {
    logger.info('starting envoy')
    this.child = execa('envoy', ['--config-yaml', this.configBuilder.getForIp(this.currentIpAddress)])
    //TODO pipe the lines into the logger
  }
  public async stop() {
    if (!this.child) {
      return
    }
    logger.info('stopping envoy')
    this.child.cancel()
    await this.child
    logger.info('envoy stopped')
  }
}