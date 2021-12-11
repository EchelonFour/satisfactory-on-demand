import { catchError, distinctUntilChanged, from, interval, map, mergeMap, NEVER, Observable, share, tap } from 'rxjs'
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
    mergeMap(() =>
      from(
        axios.get<EnvoyStatsResponse>(
          `http://localhost:${envoyPort}/stats?filter=udp.(game|beacon).downstream_sess_active&format=json`,
        ),
      ).pipe(
        catchError((error) => {
          logger.error({ error }, 'failed to get session stats from envoy')
          return NEVER
        }),
      ),
    ),
    map((response) => Math.max(...response.data.stats.map((stat) => stat.value))),
    distinctUntilChanged(),
    tap((sessions) => logger.debug({ sessions }, 'current session count')),
    share(),
  )
}
