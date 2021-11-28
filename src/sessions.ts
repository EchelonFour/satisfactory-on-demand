import { distinctUntilChanged, interval, map, Observable, share, switchMap, tap } from 'rxjs'
import axios from 'axios'
import globalLogger from './logger.js'
import config from './config.js'

interface EnvoyStatsResponse {
  stats: { value: number; name: string }[]
}

const logger = globalLogger.child({ module: 'sessions' })

export function currentSessionCount$(
  readInterval = config.get('statsReadInterval'),
  envoyPort = config.get('envoyAdminPort'),
): Observable<number> {
  return interval(readInterval).pipe(
    switchMap(() =>
      axios.get<EnvoyStatsResponse>(
        `http://localhost:${envoyPort}/stats?filter=udp.[a-z]*.downstream_sess_active&format=json`,
      ),
    ),
    map((response) => Math.max(...response.data.stats.map((stat) => stat.value))),
    distinctUntilChanged(),
    tap((sessions) => logger.debug({ sessions }, 'current session count')),
    share(),
  )
}
