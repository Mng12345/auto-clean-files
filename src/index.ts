import config from './config'
import * as fsp from 'fs/promises'
import * as path from 'path'
import lodash, { uniqueId } from 'lodash'
import schedule from 'node-schedule'
import { configure, getLogger, Logger } from 'log4js'

type FileInfo = {
  createTime: Date
  absolutePath: string
}

async function scan(dir: string, filesToClean: FileInfo[]) {
  const stat = await fsp.stat(dir)
  if (!stat.isDirectory()) return
  const list = await fsp.readdir(dir)
  const fileInfos = [] as FileInfo[]
  for (const filename of list) {
    const filePath = path.resolve(dir, filename)
    const stat = await fsp.stat(filePath)
    if (stat.isFile()) {
      if (lodash.some(config.exclude, (regexp) => regexp.test(filename))) {
        continue
      }
      if (lodash.some(config.include, (regexp) => regexp.test(filename))) {
        fileInfos.push({
          absolutePath: filePath,
          createTime: stat.birthtime,
        })
      }
    } else {
      scan(dir, filesToClean)
    }
  }
  let currFilesToClean: FileInfo[] = lodash.sortBy(fileInfos, (item) =>
    item.createTime.getTime()
  )
  currFilesToClean =
    currFilesToClean.length > config.retainPerDir
      ? currFilesToClean.slice(0, currFilesToClean.length - config.retainPerDir)
      : []
  filesToClean.push(...currFilesToClean)
}

async function checkAccess(filePath: string) {
  try {
    await fsp.access(filePath)
  } catch (e) {
    throw new Error(`no access to file \`${filePath}\`.`)
  }
}

async function checkConfig() {
  if (!config.path) {
    throw new Error(`config.path must exisits.`)
  }
  if (!config.logPath) {
    throw new Error(`config.logPath must exisits.`)
  }
  const logStat = await fsp.stat(config.logPath)
  if (logStat.isDirectory()) {
    config.logPath = path.resolve(config.logPath, './log.txt')
    fsp.writeFile(config.logPath, '')
  }
  checkAccess(config.logPath)
  await fsp.writeFile(config.logPath, '')
  if (
    typeof config.retainPerDir !== 'number' ||
    parseInt(`${config.retainPerDir}`) !== config.retainPerDir
  ) {
    throw new Error(`config.retainPerDir must be number and integer.`)
  }
  if (config.include.length === 0) {
    config.include = [/.*/]
  }
}

async function clean() {
  const logger = LoggerUtil.getLogger()
  const filesToClean = [] as FileInfo[]
  await scan(config.path, filesToClean)
  for (const fileInfo of filesToClean) {
    try {
      await fsp.rm(fileInfo.absolutePath)
      logger.info(`successed deleted file: \`${fileInfo.absolutePath}\`.`)
    } catch (e: any) {
      logger.error(
        `failed to delete file: \`${fileInfo.absolutePath}\` with error: ${e.message}`
      )
    }
  }
}

class LoggerUtil {
  private static logger: Logger | undefined = undefined

  static initLogger(): void {
    configure({
      appenders: { cheese: { type: 'file', filename: config.logPath } },
      categories: { default: { appenders: ['cheese'], level: 'error' } },
    })
    const logger = getLogger()
    logger.level = 'debug'
    LoggerUtil.logger = logger
  }

  static getLogger(): Logger {
    if (!LoggerUtil.logger) {
      throw new Error(`init logger first.`)
    }
    return LoggerUtil.logger
  }
}

async function start() {
  await checkConfig()
  LoggerUtil.initLogger()
  const rule = new schedule.RecurrenceRule()
  rule.second = 30
  schedule.scheduleJob(rule, clean)
}

start().catch((e) => {
  throw e
})
