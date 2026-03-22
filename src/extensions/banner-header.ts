/**
 * Banner Header Extension for Clawx TUI.
 *
 * Renders the CLAWX ASCII art banner as a pinned TUI header component
 * instead of printing it to console.error (which scrolls away).
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { VERSION } from "../cli/banner.js";

export interface BannerHeaderOptions {
  model: string;
  provider: string;
}

export function createBannerHeaderExtension(options: BannerHeaderOptions) {
  return function bannerHeaderExtension(pi: ExtensionAPI): void {
    pi.on("session_start", async (_event, ctx) => {
      ctx.ui.setHeader((tui, theme) => {
        const logo =
          `  ${theme.bold(theme.fg("accent", "╔═╗╦  ╔═╗╦ ╦═╗╔═"))}\n` +
          `  ${theme.bold(theme.fg("accent", "║  ║  ╠═╣║║║ ╚╝"))}\n` +
          `  ${theme.bold(theme.fg("accent", "╚═╝╩═╝╩ ╩╚╩╝═╝╚═"))}`;

        const meta =
          theme.fg("dim", `  v${VERSION}`) +
          theme.fg("dim", "  ·  ") +
          theme.fg("text", options.model) +
          theme.fg("dim", " via ") +
          theme.fg("text", options.provider);

        const separator = theme.fg("dim", "  " + "─".repeat(40));

        const bannerText = `${logo}\n${meta}\n${separator}`;

        return {
          render(width: number): string[] {
            return bannerText.split("\n");
          },
          invalidate() {},
        };
      });
    });
  };
}
