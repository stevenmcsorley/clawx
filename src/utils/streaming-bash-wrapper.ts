/**
 * Streaming command wrapper
 *
 * Provides incremental stdout/stderr streaming for worker command execution.
 * Uses cmd.exe on Windows and bash on Unix-like systems.
 */

import { spawn } from 'child_process';
import { log } from './logger.js';

export interface StreamingBashOptions {
  command: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeout?: number;
  onStdout?: (data: string) => void;
  onStderr?: (data: string) => void;
}

export interface StreamingBashResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  success: boolean;
}

function getStreamingCommand(command: string): { file: string; args: string[] } {
  if (process.platform === 'win32') {
    return { file: 'cmd.exe', args: ['/d', '/s', '/c', command] };
  }

  return { file: 'bash', args: ['-c', command] };
}

/**
 * Execute a command with real incremental streaming.
 */
export async function executeBashWithStreaming(
  options: StreamingBashOptions
): Promise<StreamingBashResult> {
  const { command, cwd, env, timeout = 30000, onStdout, onStderr } = options;

  return new Promise((resolve, reject) => {
    log.debug(`Executing command with streaming: ${command}`);

    const { file, args } = getStreamingCommand(command);
    const child = spawn(file, args, {
      cwd: cwd || process.cwd(),
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let timeoutId: NodeJS.Timeout | null = null;

    if (timeout > 0) {
      timeoutId = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`Command timeout after ${timeout}ms: ${command}`));
      }, timeout);
    }

    child.stdout.on('data', (data: Buffer) => {
      const text = data.toString();
      stdout += text;
      onStdout?.(text);
    });

    child.stderr.on('data', (data: Buffer) => {
      const text = data.toString();
      stderr += text;
      onStderr?.(text);
    });

    child.on('close', (code) => {
      if (timeoutId) clearTimeout(timeoutId);
      resolve({
        exitCode: code || 0,
        stdout,
        stderr,
        success: code === 0,
      });
    });

    child.on('error', (error) => {
      if (timeoutId) clearTimeout(timeoutId);
      reject(error);
    });
  });
}

/**
 * Check if we can use streaming command execution.
 */
export function canUseStreamingBash(): boolean {
  return true;
}
