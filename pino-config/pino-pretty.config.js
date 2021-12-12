/* eslint-disable @typescript-eslint/restrict-template-expressions */
// eslint-disable-next-line import/no-extraneous-dependencies -- this is a dev only file
const colorette = require('colorette')

module.exports = {
  messageFormat(log, messageKey, _levelLabel) {
    const logParts = []
    logParts.push(colorette.magenta(`[${log.module || 'global'}]`))
    if (log.envoyPid || log.envoyModule) {
      logParts.push(colorette.underline(colorette.gray(`${log.envoyPid}|${log.envoyModule}`)))
    }
    logParts.push(log[messageKey])
    return logParts.join(' - ')
  },
  ignore: 'pid,hostname,module,envoyPid,envoyModule',
  translateTime: 'SYS:standard',
}
/* eslint-enable @typescript-eslint/restrict-template-expressions */
