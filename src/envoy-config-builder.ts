import { readFileSync } from 'fs'
import { load, dump } from 'js-yaml'
import { config } from './config.js'

export class EnvoyConfigBuilder {
  private templateContents: string

  constructor(
    protected templateFile: string = config.get('envoyConfigTemplate'),
    protected serverPort = config.get('serverPort'),
    protected gamePort = config.get('gamePort'),
    protected fakeServerPort = config.get('fakeServerPort'),
    protected envoyAdminPort = config.get('envoyAdminPort'),
  ) {
    this.templateContents = readFileSync(templateFile, { encoding: 'utf8' })
  }

  public getForIp(ipAddress: string, destinationPort: number = this.gamePort): string {
    const template = load(this.templateContents)
    return dump(template, {
      indent: 0,
      flowLevel: 0,
      replacer: (_key, value: unknown) => {
        if (value === 'DESTINATION_IP') {
          return ipAddress
        }
        if (value === 'GAME_PORT') {
          return this.gamePort
        }
        if (value === 'SERVER_PORT') {
          return this.serverPort
        }
        if (value === 'ADMIN_PORT') {
          return this.envoyAdminPort
        }
        if (value === 'DESTINATION_GAME_PORT') {
          return destinationPort
        }
        if (value === 'DESTINATION_SERVER_PORT') {
          return destinationPort
        }
        return value
      },
    }).trim()
  }

  public getForLocalFake(ipAddress = '127.0.0.1'): string {
    return this.getForIp(ipAddress, this.fakeServerPort)
  }
}
