/**
 * Banner Header Extension for Clawx TUI.
 *
 * Renders the CLAWX ASCII art banner in the TUI header (visible at startup,
 * scrolls away as content fills in — same behavior as Claude Code).
 *
 * Also sets a persistent status line in the footer showing model/provider
 * info so it's always visible.
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
      // Set the ASCII art banner as the TUI header (visible at startup)
      ctx.ui.setHeader((_tui, theme) => {
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
