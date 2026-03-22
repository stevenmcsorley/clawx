/**
 * Banner Header Extension for Clawx TUI.
 *
 * Renders the CLAWX ASCII art banner as a sticky overlay pinned to the
 * top of the viewport. Uses pi-tui's overlay system which composites at
 * viewport-relative positions, so the header stays visible as content scrolls.
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

        // Show banner as a non-capturing overlay pinned to top-left.
        // Overlays are composited at viewport-relative positions, so
        // the header stays visible regardless of scroll position.
        const bannerComponent = {
          render(width: number): string[] {
            return bannerText.split("\n");
          },
          invalidate() {},
        };

        const handle = tui.showOverlay(bannerComponent, {
          anchor: "top-left" as any,
          nonCapturing: true,
          width: "100%",
        });

        // Return empty component for the header slot; the visual header
        // is the overlay. dispose() hides the overlay on /reload.
        return {
          render(): string[] { return []; },
          invalidate() {},
          dispose() { handle.hide(); },
        };
      });
    });
  };
}
