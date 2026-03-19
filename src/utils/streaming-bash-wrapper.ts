/**
 * Streaming Bash Wrapper
 * 
 * Provides incremental stdout/stderr streaming for bash tool execution.
 * This is a truthful wrapper that streams output as it becomes available.
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

/**
 * Execute a bash command with real incremental streaming
 */
export async function executeBashWithStreaming(
  options: StreamingBashOptions
): Promise<StreamingBashResult> {
  const { command, cwd, env, timeout = 30000, onStdout, onStderr } = options;
  
  return new Promise((resolve, reject) => {
    log.debug(`Executing bash with streaming: ${command}`);
    
    const child = spawn('bash', ['-c', command], {
      cwd: cwd || process.cwd(),
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    
    let stdout = '';
    let stderr = '';
    let timeoutId: NodeJS.Timeout | null = null;
    
    // Set timeout if specified
    if (timeout > 0) {
      timeoutId = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`Command timeout after ${timeout}ms: ${command}`));
      }, timeout);
    }
    
    // Stream stdout incrementally
    child.stdout.on('data', (data: Buffer) => {
      const text = data.toString();
      stdout += text;
      if (onStdout) {
        onStdout(text);
      }
    });
    
    // Stream stderr incrementally
    child.stderr.on('data', (data: Buffer) => {
      const text = data.toString();
      stderr += text;
      if (onStderr) {
        onStderr(text);
      }
    });
    
    child.on('close', (code) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      const result: StreamingBashResult = {
        exitCode: code || 0,
        stdout,
        stderr,
        success: code === 0,
      };
      
      resolve(result);
    });
    
    child.on('error', (error) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      reject(error);
    });
  });
}

/**
 * Check if we can use streaming bash (platform support)
 */
export function canUseStreamingBash(): boolean {
  // Streaming bash works on Unix-like systems and Windows with WSL/bash
  // For now, assume it works everywhere Node.js child_process.spawn works
  return true;
}