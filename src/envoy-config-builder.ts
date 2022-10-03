import { readFileSync } from 'fs'
import { load, dump } from 'js-yaml'
import { config } from './config.js'

export class EnvoyConfigBuilder {
  private templateContents: string

  constructor(
    protected templateFile: string = config.get('envoyConfigTemplate'),
    protected queryPort = config.get('queryPort'),
    protected beaconPort = config.get('beaconPort'),
    protected gamePort = config.get('gamePort'),
    protected fakeQueryPort = config.get('fakeQueryPort'),
    protected envoyAdminPort = config.get('envoyAdminPort'),
  ) {
    this.templateContents = readFileSync(templateFile, { encoding: 'utf8' })
  }

  public getForIp(ipAddress: string, destinationQueryPort: number = this.queryPort): string {
    const template = load(this.templateContents)
    return dump(template, {
      indent: 0,
      flowLevel: 0,
      replacer: (_key, value: unknown) => {
        if (value === 'DESTINATION_IP') {
          return ipAddress
        }
        if (value === 'LISTEN_QUERY_PORT') {
          return this.queryPort
        }
        if (value === 'BEACON_PORT') {
          return this.beaconPort
        }
        if (value === 'GAME_PORT') {
          return this.gamePort
        }
        if (value === 'DESTINATION_QUERY_PORT') {
          return destinationQueryPort
        }
        if (value === 'ADMIN_PORT') {
          return this.envoyAdminPort
        }
        return value
      },
    }).trim()
  }

  public getForLocalFake(ipAddress = '127.0.0.1'): string {
    return this.getForIp(ipAddress, this.fakeQueryPort)
  }
}
