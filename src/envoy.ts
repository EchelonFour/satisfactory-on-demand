import { once } from 'events'
import { execa, ExecaChildProcess } from 'execa'
import type { pino } from 'pino'
import { createInterface } from 'readline'
import globalLogger from './logger.js'

const logger = globalLogger.child({ module: 'envoy-manager' })

interface EnvoyLogLine {
  lvl: 'trace' | 'debug' | 'info' | 'warning' | 'warn' | 'error' | 'critical'
  name: string
  msg: string
}

export class EnvoyManager {
  protected child: ExecaChildProcess | null = null

  protected allLivingChildren: ExecaChildProcess[] = []

  protected currentConfig: string | null = null

  protected epoch = 0

  public async start(config: string): Promise<void> {
    this.currentConfig = config
    logger.info({ epoch: this.epoch }, 'starting envoy')
    this.child = execa(
      'envoy',
      [
        '--log-format',
        '{"lvl": "%l","name":"%n","msg":"%j"}',
        '--restart-epoch',
        this.epoch.toString(),
        '--config-yaml',
        this.currentConfig,
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
    const localLogger = globalLogger.child({ envoyPid, module: 'envoy' })
    const readlineOut = createInterface({
      input: childOutput,
    })
    readlineOut.on('line', (line) => {
      try {
        const { lvl, name, msg } = JSON.parse(line) as EnvoyLogLine
        const log = getLoggerFromEnvoyLevel(localLogger, lvl)
        log({ envoyModule: name }, msg)
      } catch {
        localLogger.warn(line)
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
    if (this.currentConfig) {
      await this.start(this.currentConfig)
    } else {
      logger.warn('tried to recover envoy, but it was never sent a config')
    }
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

function getLoggerFromEnvoyLevel(localLogger: pino.Logger, level: EnvoyLogLine['lvl']): pino.LogFn {
  switch (level) {
    case 'critical':
    case 'error':
      return localLogger.error.bind(localLogger)
    case 'warn':
    case 'warning':
      return localLogger.warn.bind(localLogger)
    case 'info':
      return localLogger.info.bind(localLogger)
    case 'debug':
      return localLogger.debug.bind(localLogger)
    case 'trace':
      return localLogger.trace.bind(localLogger)
    default:
      return localLogger.warn.bind(localLogger)
  }
}
