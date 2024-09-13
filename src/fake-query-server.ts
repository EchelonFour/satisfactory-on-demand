import dgram from 'dgram'
import { SocketAsPromised, DgramAsPromised } from 'dgram-as-promised'
import { SmartBuffer } from 'smart-buffer'
import config from './config.js'
import globalLogger from './logger.js'

const logger = globalLogger.child({ module: 'fake-query' })
const PROTOCOL_MAGIC = 0xf6d5 // 0xF6D5
const PROTOCOL_VERSION = 1
const TERMINATOR_BYTE = 1
const ENCODING = 'utf-8' as const

enum SatisfactoryMessageType {
  PollServerState = 0,
  ServerStateResponse = 1,
}

enum SatisfactoryServerState {
  Offline = 0,
  Idle = 1,
  Loading = 2,
  Playing = 3,
}

export class FakeQueryServer {
  protected socketIPv4: SocketAsPromised | null = null

  protected socketIPv6: SocketAsPromised | null = null

  constructor(
    protected port = config.get('fakeServerPort'),
    protected fakeVersion = config.get('fakeQueryVersionResponse'),
    protected fakeName = config.get('fakeServerNameResponse'),
  ) {}

  public async start(): Promise<void> {
    if (this.socketIPv4 != null) {
      await this.stop()
    }
    this.socketIPv4 = DgramAsPromised.createSocket('udp4', (msg, rinfo) => {
      if (!this.socketIPv4) {
        return
      }
      void this.messageHandler(this.socketIPv4, msg, rinfo)
    })
    await this.socketIPv4.bind(this.port)
    this.socketIPv6 = DgramAsPromised.createSocket('udp6', (msg, rinfo) => {
      if (!this.socketIPv6) {
        return
      }
      void this.messageHandler(this.socketIPv6, msg, rinfo)
    })
    await this.socketIPv6.bind(this.port)
    logger.info('now listening for query connections')
  }

  protected async messageHandler(socket: SocketAsPromised, msg: Buffer, rinfo: dgram.RemoteInfo): Promise<void> {
    const cookie = this.parsePollRequest(msg)
    if (cookie == null) {
      return
    }
    const response = this.buildServerStateResponse(cookie)
    logger.trace({ request: msg, response }, 'sending back query response')
    try {
      await socket.send(response, rinfo.port, rinfo.address)
    } catch (error) {
      logger.warn({ error }, 'failed to send back response from query')
    }
  }

  protected parsePollRequest(msg: Buffer): bigint | null {
    const request = SmartBuffer.fromBuffer(msg)
    if (request.readUInt16LE() !== PROTOCOL_MAGIC) {
      logger.info('received incorrect magic in a query. Either a rouge probe or the protocol changed')
      return null
    }
    if (request.readUInt8() !== SatisfactoryMessageType.PollServerState) {
      return null
    }
    if (request.readUInt8() !== PROTOCOL_VERSION) {
      return null
    }
    const cookie = msg.readBigUInt64LE()
    if (request.readUInt8() !== TERMINATOR_BYTE) {
      return null
    }
    if (request.remaining() !== 0) {
      return null
    }
    return cookie
  }

  protected buildServerStateResponse(cookie: bigint): Buffer {
    const response = new SmartBuffer()
    response.writeUInt16LE(PROTOCOL_MAGIC) //ProtocolMagic
    response.writeUInt8(SatisfactoryMessageType.ServerStateResponse) //MessageType
    response.writeUInt8(PROTOCOL_VERSION) //ProtocolVersion
    // Payload
    response.writeBigInt64LE(cookie) //Cookie
    response.writeUInt8(SatisfactoryServerState.Loading) //ServerState
    response.writeUInt32LE(this.fakeVersion) //ServerNetCL
    // set no flags
    response.writeBigUInt64LE(BigInt(0)) //ServerFlags
    //return no states
    response.writeUInt8(0) // NumSubStates
    response.writeUInt16LE(Buffer.byteLength(this.fakeName, ENCODING)) //ServerNameLength
    response.writeString(this.fakeName, ENCODING) //ServerName
    response.writeUInt8(TERMINATOR_BYTE) //Terminator Byte
    return response.toBuffer()
  }

  public async stop(): Promise<void> {
    const { socketIPv4, socketIPv6 } = this
    this.socketIPv4 = null
    this.socketIPv6 = null
    await Promise.all([socketIPv4?.close(), socketIPv6?.close()])
  }
}
