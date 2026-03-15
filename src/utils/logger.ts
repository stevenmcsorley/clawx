/**
 * Structured logger for Clawdex.
 * Simple, no dependencies beyond chalk.
 */

import chalk from "chalk";

type LogLevel = "debug" | "info" | "warn" | "error";

let currentLevel: LogLevel = "info";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export function setLogLevel(level: LogLevel) {
  currentLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[currentLevel];
}

function timestamp(): string {
  return new Date().toISOString().slice(11, 23);
}

export function debug(msg: string, ...args: unknown[]) {
  if (!shouldLog("debug")) return;
  console.error(chalk.gray(`[${timestamp()}] DBG ${msg}`), ...args);
}

export function info(msg: string, ...args: unknown[]) {
  if (!shouldLog("info")) return;
  console.error(chalk.blue(`[${timestamp()}] INF ${msg}`), ...args);
}

export function warn(msg: string, ...args: unknown[]) {
  if (!shouldLog("warn")) return;
  console.error(chalk.yellow(`[${timestamp()}] WRN ${msg}`), ...args);
}

export function error(msg: string, ...args: unknown[]) {
  if (!shouldLog("error")) return;
  console.error(chalk.red(`[${timestamp()}] ERR ${msg}`), ...args);
}

export const log = { debug, info, warn, error, setLogLevel };
