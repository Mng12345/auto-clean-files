"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = __importDefault(require("./config"));
const fsp = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const lodash_1 = __importDefault(require("lodash"));
const node_schedule_1 = __importDefault(require("node-schedule"));
const log4js_1 = require("log4js");
function scan(dir, filesToClean) {
    return __awaiter(this, void 0, void 0, function* () {
        const stat = yield fsp.stat(dir);
        if (!stat.isDirectory())
            return;
        const list = yield fsp.readdir(dir);
        const fileInfos = [];
        for (const filename of list) {
            const filePath = path.resolve(dir, filename);
            const stat = yield fsp.stat(filePath);
            if (stat.isFile()) {
                if (lodash_1.default.some(config_1.default.exclude, (regexp) => regexp.test(filename))) {
                    continue;
                }
                if (lodash_1.default.some(config_1.default.include, (regexp) => regexp.test(filename))) {
                    fileInfos.push({
                        absolutePath: filePath,
                        createTime: stat.birthtime,
                    });
                }
            }
            else {
                scan(dir, filesToClean);
            }
        }
        let currFilesToClean = lodash_1.default.sortBy(fileInfos, (item) => item.createTime.getTime());
        currFilesToClean =
            currFilesToClean.length > config_1.default.retainPerDir
                ? currFilesToClean.slice(0, currFilesToClean.length - config_1.default.retainPerDir)
                : [];
        filesToClean.push(...currFilesToClean);
    });
}
function checkAccess(filePath) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield fsp.access(filePath);
        }
        catch (e) {
            throw new Error(`no access to file \`${filePath}\`.`);
        }
    });
}
function checkConfig() {
    return __awaiter(this, void 0, void 0, function* () {
        if (!config_1.default.path) {
            throw new Error(`config.path must exisits.`);
        }
        if (!config_1.default.logPath) {
            throw new Error(`config.logPath must exisits.`);
        }
        const logStat = yield fsp.stat(config_1.default.logPath);
        if (logStat.isDirectory()) {
            config_1.default.logPath = path.resolve(config_1.default.logPath, './log.txt');
            fsp.writeFile(config_1.default.logPath, '');
        }
        checkAccess(config_1.default.logPath);
        yield fsp.writeFile(config_1.default.logPath, '');
        console.log(`###########logPath: ${config_1.default.logPath}`);
        if (typeof config_1.default.retainPerDir !== 'number' ||
            parseInt(`${config_1.default.retainPerDir}`) !== config_1.default.retainPerDir) {
            throw new Error(`config.retainPerDir must be number and integer.`);
        }
        if (config_1.default.include.length === 0) {
            config_1.default.include = [/.*/];
        }
    });
}
function clean() {
    return __awaiter(this, void 0, void 0, function* () {
        const logger = LoggerUtil.getLogger();
        const filesToClean = [];
        yield scan(config_1.default.path, filesToClean);
        for (const fileInfo of filesToClean) {
            try {
                yield fsp.rm(fileInfo.absolutePath);
                logger.info(`successed deleted file: \`${fileInfo.absolutePath}\`.`);
            }
            catch (e) {
                logger.error(`failed to delete file: \`${fileInfo.absolutePath}\` with error: ${e.message}`);
            }
        }
    });
}
class LoggerUtil {
    static initLogger() {
        log4js_1.configure({
            appenders: { cheese: { type: 'file', filename: config_1.default.logPath } },
            categories: { default: { appenders: ['cheese'], level: 'error' } },
        });
        const logger = log4js_1.getLogger();
        logger.level = 'debug';
        LoggerUtil.logger = logger;
    }
    static getLogger() {
        if (!LoggerUtil.logger) {
            throw new Error(`init logger first.`);
        }
        return LoggerUtil.logger;
    }
}
LoggerUtil.logger = undefined;
function start() {
    return __awaiter(this, void 0, void 0, function* () {
        yield checkConfig();
        LoggerUtil.initLogger();
        const rule = new node_schedule_1.default.RecurrenceRule();
        rule.second = 30;
        node_schedule_1.default.scheduleJob(rule, clean);
    });
}
start().catch((e) => {
    throw e;
});
