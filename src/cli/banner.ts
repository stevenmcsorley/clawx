/**
 * Startup banner for Clawx CLI.
 */

import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../package.json"), "utf-8"));

const LOGO = `
  ${chalk.bold.cyan("╔═╗╦  ╔═╗╦ ╦═╗╔═")}
  ${chalk.bold.cyan("║  ║  ╠═╣║║║ ╚╝")}
  ${chalk.bold.cyan("╚═╝╩═╝╩ ╩╚╩╝═╝╚═")}`;

export const VERSION: string = pkg.version;

export function printBanner(model: string, provider: string): void {
  console.error(LOGO);
  console.error(
    chalk.gray("  v" + VERSION) +
    chalk.gray("  ·  ") +
    chalk.white(model) +
    chalk.gray(" via ") +
    chalk.white(provider),
  );
  console.error(chalk.gray("  " + "─".repeat(40)));
  console.error();
}

export function printBannerCompact(model: string, provider: string): void {
  console.error(
    chalk.bold.cyan("clawx") +
    chalk.gray(` v${VERSION}`) +
    chalk.gray("  ·  ") +
    chalk.white(model) +
    chalk.gray(" via ") +
    chalk.white(provider),
  );
}
