/**
 * Chat Mode Extension for Clawx TUI.
 *
 * Provides /chat command to toggle chat-only mode (no tools).
 * Auto-detects when a model doesn't support tools and switches.
 * Swaps the system prompt between agent mode and chat mode.
 *
 * When switching back to agent mode (via /chat toggle or model change),
 * restores tools and the full agent system prompt.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export interface ChatModeOptions {
  /** The full agent system prompt (with tools) */
  agentSystemPrompt: string;
  /** The chat-only system prompt (no tools) */
  chatSystemPrompt: string;
  /** Start in chat mode immediately */
  startInChatMode?: boolean;
  /** Whether SSH tools are enabled (--ssh flag) */
  sshEnabled?: boolean;
  /** Callback when chat mode changes */
  onChatModeChange?: (chatMode: boolean) => void;
}

export function createChatModeExtension(options: ChatModeOptions) {
  return function chatModeExtension(pi: ExtensionAPI): void {
    let chatMode = options.startInChatMode ?? false;
    let sshEnabled = options.sshEnabled ?? false;
    let savedToolNames: string[] = [];
    const SSH_TOOL = "ssh_run";

    function enableChatMode(ctx: { ui: { notify: (msg: string, type?: "info" | "warning" | "error") => void } }) {
      if (chatMode) return;
      chatMode = true;
      // Save current tools before disabling
      savedToolNames = pi.getAllTools().map((t) => t.name);
      pi.setActiveTools([]);
      ctx.ui.notify("Chat mode enabled — tools disabled", "info");
      options.onChatModeChange?.(true);
    }

    function disableChatMode(ctx: { ui: { notify: (msg: string, type?: "info" | "warning" | "error") => void } }) {
      if (!chatMode) return;
      chatMode = false;
      // Restore saved tools (or all if none saved)
      const allTools = pi.getAllTools().map((t) => t.name);
      const restore = savedToolNames.length > 0 ? savedToolNames : allTools;
      pi.setActiveTools(restore);
      ctx.ui.notify("Agent mode enabled — tools restored", "info");
      options.onChatModeChange?.(false);
    }

    // Apply initial state on session start
    pi.on("session_start", async (_event, ctx) => {
      if (chatMode) {
        savedToolNames = pi.getAllTools().map((t) => t.name);
        pi.setActiveTools([]);
        ctx.ui.setStatus("mode", "chat mode");
      } else {
        // Deactivate SSH tools unless --ssh was passed
        if (!sshEnabled) {
          const activeTools = pi.getAllTools().map((t) => t.name).filter((n) => n !== SSH_TOOL);
          pi.setActiveTools(activeTools);
        }
        ctx.ui.setStatus("mode", "agent mode");
      }
    });

    // Register /chat command to toggle
    pi.registerCommand("chat", {
      description: "Toggle chat mode (no tools, just conversation)",
      handler: async (_args, ctx) => {
        if (chatMode) {
          disableChatMode(ctx);
          ctx.ui.setStatus("mode", "agent mode");
        } else {
          enableChatMode(ctx);
          ctx.ui.setStatus("mode", "chat mode");
        }
      },
    });

    // Register /ssh command to toggle SSH tools
    pi.registerCommand("ssh", {
      description: "Toggle SSH tools (remote command execution)",
      handler: async (_args, ctx) => {
        if (chatMode) {
          ctx.ui.notify("Cannot enable SSH in chat mode — switch to agent mode first with /chat", "warning");
          return;
        }
        sshEnabled = !sshEnabled;
        const currentTools = pi.getAllTools().map((t) => t.name);
        if (sshEnabled) {
          // Activate all tools including SSH
          pi.setActiveTools(currentTools);
          ctx.ui.notify("SSH tools enabled — model can now run commands on remote systems", "warning");
        } else {
          // Deactivate SSH tool
          pi.setActiveTools(currentTools.filter((n) => n !== SSH_TOOL));
          ctx.ui.notify("SSH tools disabled", "info");
        }
      },
    });

    // Swap system prompt before each agent turn
    pi.on("before_agent_start", async (event) => {
      if (chatMode) {
        return {
          systemPrompt: options.chatSystemPrompt,
        };
      }
      // In agent mode, ensure the agent prompt is used
      return {
        systemPrompt: options.agentSystemPrompt,
      };
    });

    // Detect tools error and auto-switch to chat mode
    pi.on("turn_end", async (event, ctx) => {
      if (chatMode) return;
      const msg = event.message;
      if (
        msg.role === "assistant" &&
        "stopReason" in msg &&
        (msg as any).stopReason === "error"
      ) {
        const errorMsg = ("errorMessage" in msg ? (msg as any).errorMessage : "") || "";
        if (
          errorMsg.includes("does not support tools") ||
          errorMsg.includes("does not support tool")
        ) {
          enableChatMode(ctx);
          ctx.ui.setStatus("mode", "chat mode");
          ctx.ui.notify(
            "Model doesn't support tools — switched to chat mode. Use /chat to toggle back.",
            "warning",
          );
        }
      }
    });

    // When model changes, check if we should restore tools
    pi.on("model_select", async (_event, ctx) => {
      // If user switches model while in auto-chat mode,
      // give them back tools (they can /chat again if needed)
      if (chatMode) {
        disableChatMode(ctx);
      }
      ctx.ui.setStatus("mode", "agent mode");
    });
  };
}
