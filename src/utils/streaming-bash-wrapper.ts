/**
 * Streaming command wrapper
 *
 * Provides incremental stdout/stderr streaming for worker command execution.
 * Uses exec on Windows with windowsHide to minimize console popups,
 * and bash on Unix-like systems.
 */

import { exec, spawn } from 'child_process';
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

/**
 * Execute a command with real incremental streaming.
 */
export async function executeBashWithStreaming(
  options: StreamingBashOptions
): Promise<StreamingBashResult> {
  const { command, cwd, env, timeout = 30000, onStdout, onStderr } = options;

  return new Promise((resolve, reject) => {
    log.debug(`Executing command with streaming: ${command}`);

    let stdout = '';
    let stderr = '';

    if (process.platform === 'win32') {
      const child = exec(command, {
        cwd: cwd || process.cwd(),
        env: { ...process.env, ...env },
        windowsHide: true,
        timeout,
      });

      child.stdout?.on('data', (data: Buffer | string) => {
        const text = data.toString();
        stdout += text;
        onStdout?.(text);
      });

      child.stderr?.on('data', (data: Buffer | string) => {
        const text = data.toString();
        stderr += text;
        onStderr?.(text);
      });

      child.on('close', (code) => {
        resolve({
          exitCode: code || 0,
          stdout,
          stderr,
          success: code === 0,
        });
      });

      child.on('error', (error) => {
        reject(error);
      });

      return;
    }

    const child = spawn('bash', ['-c', command], {
      cwd: cwd || process.cwd(),
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    });

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
