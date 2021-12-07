import { readFileSync } from 'fs'
import { config } from './config.js'

export class EnvoyConfigBuilder {
  private templateContents: string

  constructor(protected templateFile: string = config.get('envoyConfigTemplate')) {
    this.templateContents = readFileSync(templateFile, { encoding: 'utf8' })
  }

  public getForIp(ipAddress: string): string {
    return this.templateContents.replaceAll('{{IP}}', ipAddress)
  }
}
