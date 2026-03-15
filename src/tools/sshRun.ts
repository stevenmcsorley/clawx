/**
 * SSH execution tool for Clawdex.
 *
 * EXTRACTION NOTE:
 * OpenClaw has NO SSH implementation — remote execution goes through a "gateway"
 * and "node-host" abstraction that requires the full platform. This is written fresh.
 *
 * Uses ssh2 to connect to named SSH targets defined in config.
 * The model can run commands on remote machines, create files, and iterate.
 */

import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { Client } from "ssh2";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { SshTarget } from "../types/index.js";
import { log } from "../utils/logger.js";

const SshRunSchema = Type.Object({
  target: Type.String({ description: "Named SSH target from config (e.g. 'pi', 'server')" }),
  command: Type.String({ description: "Shell command to execute on the remote host" }),
  timeout: Type.Optional(Type.Number({ description: "Timeout in ms (default: 30000)" })),
});

type SshRunInput = Static<typeof SshRunSchema>;

export interface SshRunDetails {
  target: string;
  host: string;
  exitCode: number | null;
  durationMs: number;
}

function resolvePrivateKey(keyPath: string): string {
  const resolved = keyPath.startsWith("~")
    ? path.join(os.homedir(), keyPath.slice(1))
    : keyPath;
  return fs.readFileSync(resolved, "utf-8");
}

async function executeSSH(
  target: SshTarget,
  command: string,
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let stdout = "";
    let stderr = "";
    let exitCode: number | null = null;
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        conn.end();
        reject(new Error(`SSH command timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    conn.on("ready", () => {
      conn.exec(command, (err, stream) => {
        if (err) {
          settled = true;
          clearTimeout(timer);
          conn.end();
          reject(err);
          return;
        }
        stream.on("close", (code: number) => {
          exitCode = code;
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            conn.end();
            resolve({ stdout, stderr, exitCode });
          }
        });
        stream.on("data", (data: Buffer) => {
          stdout += data.toString();
        });
        stream.stderr.on("data", (data: Buffer) => {
          stderr += data.toString();
        });
      });
    });

    conn.on("error", (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(err);
      }
    });

    const connectConfig: Record<string, unknown> = {
      host: target.host,
      port: target.port || 22,
      username: target.username,
    };

    if (target.privateKeyPath) {
      try {
        connectConfig.privateKey = resolvePrivateKey(target.privateKeyPath);
      } catch (e) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`Failed to read SSH key: ${target.privateKeyPath}: ${e}`));
        return;
      }
    } else if (target.password) {
      connectConfig.password = target.password;
    }

    conn.connect(connectConfig as Parameters<Client["connect"]>[0]);
  });
}

export function createSshRunTool(
  targets: Record<string, SshTarget>,
): AgentTool<typeof SshRunSchema, SshRunDetails> {
  return {
    name: "ssh_run",
    label: "SSH Run",
    description:
      "Execute a shell command on a remote host via SSH. " +
      `Available targets: ${Object.keys(targets).join(", ") || "(none configured)"}`,
    parameters: SshRunSchema,
    async execute(
      _toolCallId: string,
      params: SshRunInput,
    ): Promise<AgentToolResult<SshRunDetails>> {
      const target = targets[params.target];
      if (!target) {
        const available = Object.keys(targets).join(", ") || "none";
        return {
          content: [
            {
              type: "text",
              text: `SSH target "${params.target}" not found. Available: ${available}`,
            },
          ],
          details: {
            target: params.target,
            host: "",
            exitCode: null,
            durationMs: 0,
          },
        };
      }

      const timeoutMs = params.timeout || 30_000;
      const start = Date.now();
      log.info(`SSH [${params.target}] ${target.username}@${target.host}: ${params.command}`);

      try {
        const result = await executeSSH(target, params.command, timeoutMs);
        const durationMs = Date.now() - start;

        let output = "";
        if (result.stdout.trim()) output += result.stdout.trim();
        if (result.stderr.trim()) {
          if (output) output += "\n--- stderr ---\n";
          output += result.stderr.trim();
        }
        if (!output) output = "(no output)";

        return {
          content: [
            {
              type: "text",
              text: `[${params.target}] exit=${result.exitCode} (${durationMs}ms)\n${output}`,
            },
          ],
          details: {
            target: params.target,
            host: target.host,
            exitCode: result.exitCode,
            durationMs,
          },
        };
      } catch (e) {
        const durationMs = Date.now() - start;
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text", text: `SSH error on ${params.target}: ${msg}` }],
          details: {
            target: params.target,
            host: target.host,
            exitCode: null,
            durationMs,
          },
        };
      }
    },
  };
}
