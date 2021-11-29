import dgram from 'dgram'
import { SocketAsPromised, DgramAsPromised } from 'dgram-as-promised'
import globalLogger from './logger.js'

const logger = globalLogger.child({ module: 'fake-query' })
const MAGIC_RESPONSE = Buffer.from('0337a70200983a', 'hex')
export class FakeQueryServer {

  protected socket: SocketAsPromised | null = null
  constructor(protected port: number) {

  }

  public async start() {
    if (this.socket != null) {
      await this.stop()
    }
    this.socket = DgramAsPromised.createSocket("udp4", (msg, rinfo) => this.messageHandler(msg, rinfo))
    await this.socket.bind(this.port)
    logger.info('now listening for query connections')
  }
  protected async messageHandler(msg: Buffer, rinfo: dgram.RemoteInfo) {
    if (!this.socket) {
      throw new Error('tried to respond on a closed socket')
    }
    
    const response = Buffer.concat([msg, MAGIC_RESPONSE]) // add the magic on the end
    response.writeUInt8(1, 0) //add 1 to the first byte (maybe should be set to 1 🤷‍♀️)
    logger.trace({ request: msg, response }, 'sending back query response')
    try {
      await this.socket.send(response, rinfo.port, rinfo.address)
    } catch (error) {
      logger.warn({ error }, 'failed to send back response from query')
    }
  }

  public async stop() {
    const socket = this.socket
    this.socket = null
    await socket?.close()
  }
}