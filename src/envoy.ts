import { once } from 'events'
import { execa, ExecaChildProcess } from 'execa'
import type { pino } from 'pino'
import { createInterface } from 'readline'
import { EnvoyConfigBuilder } from './envoy-config-builder.js'
import globalLogger from './logger.js'

const logger = globalLogger.child({ module: 'envoy' })

interface EnvoyLogLine {
  lvl: 'trace' | 'debug' | 'info' | 'warning' | 'warn' | 'error' | 'critical'
  name: string
  msg: string
}
export class EnvoyManager {
  protected child: ExecaChildProcess | null = null

  protected allLivingChildren: ExecaChildProcess[] = []

  protected currentIpAddress = '127.0.0.1'

  protected configBuilder = new EnvoyConfigBuilder()

  protected epoch = 0

  public async setToNewIp(ipAddress: string): Promise<void> {
    this.currentIpAddress = ipAddress
    await this.start()
  }

  public async start(): Promise<void> {
    logger.info({ epoch: this.epoch }, 'starting envoy')
    this.child = execa(
      'envoy',
      [
        '--log-format',
        '{"lvl": "%l","name":"%n","msg":"%j"}',
        '--restart-epoch',
        this.epoch.toString(),
        '--config-yaml',
        this.configBuilder.getForIp(this.currentIpAddress),
      ],
      {
        all: true,
        buffer: false,
        reject: false,
      },
    )
    this.epoch += 1
    this.allLivingChildren.push(this.child)
    await this.handleChildProcess(this.child)
  }

  private async handleChildProcess(child: ExecaChildProcess): Promise<void> {
    await once(child, 'spawn')
    const { pid: envoyPid, all: childOutput } = child
    if (!childOutput) {
      throw new Error('cannot pipe logs from a child with no stdout')
    }
    const readlineOut = createInterface({
      input: childOutput,
    })
    readlineOut.on('line', (line) => {
      try {
        const { lvl, name, msg } = JSON.parse(line) as EnvoyLogLine
        const log = getLoggerFromEnvoyLevel(lvl)
        log({ envoyPid, envoyModule: name }, msg)
      } catch {
        logger.warn({ envoyPid }, line)
      }
    })
    void child.on('exit', (code) => {
      logger.info({ envoyPid, code }, 'envoy exited')
      if (code !== 0 && envoyPid === this.child?.pid) {
        void this.handleDisaster()
      }
    })
  }

  private async handleDisaster(): Promise<void> {
    logger.error('something has gone wrong with envoy, killing everything and restarting')
    for (const child of this.allLivingChildren) {
      if (child.exitCode == null && !child.killed) {
        child.kill()
      }
    }
    await Promise.all(this.allLivingChildren)
    logger.warn('all the old envoys are dead, starting again')
    this.allLivingChildren = []
    this.child = null
    this.epoch = 0
    await this.start()
  }

  public async stop(childToStop?: ExecaChildProcess | null): Promise<void> {
    const child = childToStop || this.child
    if (!child) {
      return
    }
    logger.info('stopping envoy')
    child.cancel()
    await child
    logger.info('envoy stopped')
  }
}

function getLoggerFromEnvoyLevel(level: EnvoyLogLine['lvl']): pino.LogFn {
  switch (level) {
    case 'critical':
    case 'error':
      return logger.error.bind(logger)
    case 'warn':
    case 'warning':
      return logger.warn.bind(logger)
    case 'info':
      return logger.info.bind(logger)
    case 'debug':
      return logger.debug.bind(logger)
    case 'trace':
      return logger.trace.bind(logger)
    default:
      return logger.warn.bind(logger)
  }
}
