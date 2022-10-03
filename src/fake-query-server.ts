import dgram from 'dgram'
import { SocketAsPromised, DgramAsPromised } from 'dgram-as-promised'
import config from './config.js'
import globalLogger from './logger.js'

const logger = globalLogger.child({ module: 'fake-query' })
const MAGIC_RESPONSE = Buffer.from('03', 'hex')

export class FakeQueryServer {
  protected socket: SocketAsPromised | null = null

  protected readonly beaconPort: Buffer

  protected readonly version: Buffer

  constructor(
    protected port: number = config.get('fakeQueryPort'),
    beaconPort: number = config.get('beaconPort'),
    version: number = config.get('fakeQueryVersionResponse'),
  ) {
    this.beaconPort = Buffer.alloc(2)
    this.beaconPort.writeUInt16LE(beaconPort)
    // eslint-disable-next-line @typescript-eslint/no-magic-numbers
    this.version = Buffer.alloc(4)
    this.version.writeInt32LE(version)
  }

  public async start(): Promise<void> {
    if (this.socket != null) {
      await this.stop()
    }
    this.socket = DgramAsPromised.createSocket('udp4', (msg, rinfo) => {
      void this.messageHandler(msg, rinfo)
    })
    await this.socket.bind(this.port)
    logger.info('now listening for query connections')
  }

  protected async messageHandler(msg: Buffer, rinfo: dgram.RemoteInfo): Promise<void> {
    if (!this.socket) {
      throw new Error('tried to respond on a closed socket')
    }
    const response = Buffer.concat([msg, MAGIC_RESPONSE, this.version, this.beaconPort]) // add the magic on the end
    response.writeUInt8(msg.readUInt8(0) + 1, 0) //add 1 to the first byte (maybe should be set to 1 🤷‍♀️)
    logger.trace({ request: msg, response }, 'sending back query response')
    try {
      await this.socket.send(response, rinfo.port, rinfo.address)
    } catch (error) {
      logger.warn({ error }, 'failed to send back response from query')
    }
  }

  public async stop(): Promise<void> {
    const { socket } = this
    this.socket = null
    await socket?.close()
  }
}
