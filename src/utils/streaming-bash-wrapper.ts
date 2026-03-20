/**
 * Streaming command wrapper
 *
 * Provides incremental stdout/stderr streaming for worker command execution.
 * On Windows, uses a hidden Node host process to execute the command and proxy
 * stdout/stderr back over IPC to avoid direct visible shell popups.
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

function createWindowsHostScript(command: string): string {
  return `
const { exec } = require('child_process');
const child = exec(${JSON.stringify(command)}, {
  cwd: ${JSON.stringify(process.cwd())},
  env: process.env,
  windowsHide: true,
  timeout: 0,
  maxBuffer: 1024 * 1024 * 20,
});
child.stdout && child.stdout.on('data', data => {
  if (process.send) process.send({ type: 'stdout', data: data.toString() });
});
child.stderr && child.stderr.on('data', data => {
  if (process.send) process.send({ type: 'stderr', data: data.toString() });
});
child.on('close', code => {
  if (process.send) process.send({ type: 'exit', code: code || 0 });
  process.exit(0);
});
child.on('error', error => {
  if (process.send) process.send({ type: 'error', error: error.message || String(error) });
  process.exit(1);
});
`;
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

    if (process.platform === 'win32') {
      const hostScript = `
const { exec } = require('child_process');
const child = exec(${JSON.stringify(command)}, {
  cwd: ${JSON.stringify(cwd || process.cwd())},
  env: process.env,
  windowsHide: true,
  timeout: 0,
  maxBuffer: 1024 * 1024 * 20,
});
child.stdout && child.stdout.on('data', data => {
  if (process.send) process.send({ type: 'stdout', data: data.toString() });
});
child.stderr && child.stderr.on('data', data => {
  if (process.send) process.send({ type: 'stderr', data: data.toString() });
});
child.on('close', code => {
  if (process.send) process.send({ type: 'exit', code: code || 0 });
  process.exit(0);
});
child.on('error', error => {
  if (process.send) process.send({ type: 'error', error: error.message || String(error) });
  process.exit(1);
});
`;

      const child = spawn(process.execPath, ['-e', hostScript], {
        cwd: cwd || process.cwd(),
        env: { ...process.env, ...env },
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        shell: false,
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';
      let resolved = false;
      let timeoutId: NodeJS.Timeout | null = null;

      if (timeout > 0) {
        timeoutId = setTimeout(() => {
          try { child.kill(); } catch {}
          reject(new Error(`Command timeout after ${timeout}ms: ${command}`));
        }, timeout);
      }

      child.on('message', (message: any) => {
        if (!message || typeof message !== 'object') return;
        if (message.type === 'stdout') {
          stdout += message.data || '';
          onStdout?.(message.data || '');
        } else if (message.type === 'stderr') {
          stderr += message.data || '';
          onStderr?.(message.data || '');
        } else if (message.type === 'error') {
          if (timeoutId) clearTimeout(timeoutId);
          if (!resolved) {
            resolved = true;
            reject(new Error(message.error || 'Unknown command host error'));
          }
        } else if (message.type === 'exit') {
          if (timeoutId) clearTimeout(timeoutId);
          if (!resolved) {
            resolved = true;
            resolve({
              exitCode: message.code || 0,
              stdout,
              stderr,
              success: (message.code || 0) === 0,
            });
          }
        }
      });

      child.on('error', (error) => {
        if (timeoutId) clearTimeout(timeoutId);
        if (!resolved) {
          resolved = true;
          reject(error);
        }
      });

      child.on('exit', (code) => {
        if (timeoutId) clearTimeout(timeoutId);
        if (!resolved) {
          resolved = true;
          resolve({
            exitCode: code || 0,
            stdout,
            stderr,
            success: (code || 0) === 0,
          });
        }
      });

      return;
    }

    const child = spawn('bash', ['-c', command], {
      cwd: cwd || process.cwd(),
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
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

export function canUseStreamingBash(): boolean {
  return true;
}
