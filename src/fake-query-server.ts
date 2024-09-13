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
  protected socket: SocketAsPromised | null = null

  constructor(
    protected port = config.get('fakeServerPort'),
    protected fakeVersion = config.get('fakeQueryVersionResponse'),
    protected fakeName = config.get('fakeServerNameResponse'),
  ) {}

  protected async createSocket(type: dgram.SocketType): Promise<SocketAsPromised | null> {
    try {
      const socket = DgramAsPromised.createSocket(type, (msg, rinfo) => {
        if (!socket) {
          return
        }
        void this.messageHandler(socket, msg, rinfo)
      })
      await socket.bind(this.port)
      return socket
    } catch (error) {
      logger.warn({ error }, 'could not listen on socket for fake server')
    }
    return null
  }

  public async start(): Promise<void> {
    if (this.socket != null) {
      await this.stop()
    }

    this.socket = await this.createSocket('udp4')

    if (this.socket == null) {
      logger.error('could not create fake server')
    } else {
      logger.info('now listening for query connections')
    }
  }

  protected async messageHandler(socket: SocketAsPromised, msg: Buffer, rinfo: dgram.RemoteInfo): Promise<void> {
    logger.trace({ source: rinfo.address }, 'received udp packet on fake server')
    const cookie = this.parsePollRequest(msg)
    if (cookie == null) {
      return
    }
    const response = this.buildServerStateResponse(cookie)
    logger.trace({ request: msg, response, cookie }, 'sending back query response')
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
    const { socket } = this
    this.socket = null
    await socket?.close()
  }
}
