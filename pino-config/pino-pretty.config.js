// eslint-disable-next-line import/no-extraneous-dependencies -- this is a dev only file
const chalk = require('chalk')

module.exports = {
  messageFormat(log, messageKey, levelLabel) {
    const logParts = []
    logParts.push(chalk.magenta`[${log.module || 'global'}]`)
    if (log.guild) {
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      logParts.push(chalk.yellow(`{Guild: ${log.guild}}`))
    }
    logParts.push(log[messageKey])
    return logParts.join(' - ')
  },
  ignore: 'pid,hostname,module,guild',
}
