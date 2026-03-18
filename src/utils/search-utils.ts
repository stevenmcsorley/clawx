/**
 * Cross-platform file search utilities
 */

import { readdirSync, statSync, readFileSync, existsSync } from 'fs';
import { join, relative } from 'path';
import { log } from './logger.js';

/**
 * Check if grep is available on this system
 */
export function isGrepAvailable(): boolean {
  try {
    const { execSync } = require('child_process');
    if (process.platform === 'win32') {
      // On Windows, check if grep is in PATH
      execSync('where grep', { stdio: 'ignore' });
      return true;
    } else {
      execSync('which grep', { stdio: 'ignore' });
      return true;
    }
  } catch {
    return false;
  }
}

/**
 * Check if ripgrep (rg) is available
 */
export function isRipgrepAvailable(): boolean {
  try {
    const { execSync } = require('child_process');
    if (process.platform === 'win32') {
      execSync('where rg', { stdio: 'ignore' });
      return true;
    } else {
      execSync('which rg', { stdio: 'ignore' });
      return true;
    }
  } catch {
    return false;
  }
}

/**
 * Platform-specific search capabilities
 */
export function getPlatformSearchCapabilities(): {
  hasGrep: boolean;
  hasRipgrep: boolean;
  recommendedTool: 'grep' | 'ripgrep' | 'node';
} {
  const hasGrep = isGrepAvailable();
  const hasRipgrep = isRipgrepAvailable();
  
  if (hasRipgrep) {
    return { hasGrep, hasRipgrep, recommendedTool: 'ripgrep' };
  } else if (hasGrep) {
    return { hasGrep, hasRipgrep, recommendedTool: 'grep' };
  } else {
    return { hasGrep, hasRipgrep, recommendedTool: 'node' };
  }
}

/**
 * Node.js based file search (fallback when grep not available)
 */
export function searchFilesNode(
  pattern: string,
  rootDir: string,
  glob?: string,
  maxResults = 50
): string[] {
  const results: string[] = [];
  const regex = new RegExp(pattern, 'i'); // Case-insensitive for now
  
  function shouldSkipDir(dirName: string): boolean {
    // Skip common directories that shouldn't be searched
    const skipDirs = [
      'node_modules',
      '.git',
      '.clawx',
      'dist',
      'build',
      'coverage',
      '__pycache__',
      '.next',
      '.nuxt',
      '.output',
      '.cache',
    ];
    return skipDirs.includes(dirName);
  }
  
  function shouldIncludeFile(fileName: string): boolean {
    if (!glob) return true;
    
    // Simple glob matching for common patterns
    if (glob.startsWith('*.')) {
      const ext = glob.substring(1); // "*.ts" -> ".ts"
      return fileName.endsWith(ext);
    }
    
    // More complex glob patterns would need a proper parser
    return fileName.includes(glob.replace('*', ''));
  }
  
  function searchDirectory(dirPath: string, depth = 0) {
    if (depth > 10) return; // Prevent infinite recursion
    if (results.length >= maxResults) return;
    
    try {
      const entries = readdirSync(dirPath);
      
      for (const entry of entries) {
        if (results.length >= maxResults) break;
        
        const fullPath = join(dirPath, entry);
        const relativePath = relative(rootDir, fullPath);
        
        try {
          const stats = statSync(fullPath);
          
          if (stats.isDirectory()) {
            if (!shouldSkipDir(entry)) {
              searchDirectory(fullPath, depth + 1);
            }
          } else if (stats.isFile() && shouldIncludeFile(entry)) {
            try {
              const content = readFileSync(fullPath, 'utf8');
              const lines = content.split('\n');
              
              for (let i = 0; i < lines.length; i++) {
                if (results.length >= maxResults) break;
                if (regex.test(lines[i])) {
                  results.push(`${relativePath}:${i + 1}:${lines[i].trim()}`);
                  break; // Only show first match per file
                }
              }
            } catch (readError) {
              // Skip binary files or permission errors
              continue;
            }
          }
        } catch (statError) {
          // Skip files we can't stat
          continue;
        }
      }
    } catch (dirError) {
      // Skip directories we can't read
      return;
    }
  }
  
  searchDirectory(rootDir);
  return results;
}

/**
 * Execute grep command with proper Windows handling
 */
export async function executeGrep(
  pattern: string,
  cwd: string,
  glob?: string,
  maxResults = 50
): Promise<{ success: boolean; output: string; error?: string }> {
  const { execFile } = require('child_process');
  const { promisify } = require('util');
  const execFileAsync = promisify(execFile);
  
  const args = ['-rn', '--color=never'];
  
  // Add glob pattern if specified
  if (glob) {
    args.push(`--include=${glob}`);
  }
  
  // Add max count
  args.push(`--max-count=${maxResults}`);
  
  // Add pattern and directory
  args.push(pattern, '.');
  
  try {
    // On Windows, we need to use the full path to grep or ensure it's in PATH
    let grepCommand = 'grep';
    if (process.platform === 'win32') {
      // Try to find grep in common locations
      const commonPaths = [
        'C:\\Program Files\\Git\\usr\\bin\\grep.exe',
        'C:\\Program Files\\Git\\bin\\grep.exe',
        'C:\\msys64\\usr\\bin\\grep.exe',
        'C:\\cygwin64\\bin\\grep.exe',
      ];
      
      for (const path of commonPaths) {
        if (existsSync(path)) {
          grepCommand = path;
          break;
        }
      }
    }
    
    const { stdout, stderr } = await execFileAsync(grepCommand, args, {
      cwd,
      timeout: 10000, // 10 second timeout
      maxBuffer: 1024 * 1024, // 1MB buffer
      encoding: 'utf-8',
    });
    
    return {
      success: true,
      output: stdout.trim(),
      error: stderr.trim() || undefined,
    };
  } catch (error: any) {
    // grep returns exit code 1 for no matches, which isn't an error
    if (error.code === 1 && error.stdout) {
      return {
        success: true,
        output: error.stdout.trim(),
        error: error.stderr.trim() || undefined,
      };
    }
    
    return {
      success: false,
      output: '',
      error: error.message || String(error),
    };
  }
}

/**
 * Execute ripgrep command
 */
export async function executeRipgrep(
  pattern: string,
  cwd: string,
  glob?: string,
  maxResults = 50
): Promise<{ success: boolean; output: string; error?: string }> {
  const { execFile } = require('child_process');
  const { promisify } = require('util');
  const execFileAsync = promisify(execFile);
  
  const args = [
    '--no-heading',
    '--line-number',
    '--color=never',
    `--max-count=${maxResults}`,
  ];
  
  if (glob) {
    args.push('--glob', glob);
  }
  
  args.push(pattern);
  
  try {
    const { stdout, stderr } = await execFileAsync('rg', args, {
      cwd,
      timeout: 10000,
      maxBuffer: 1024 * 1024,
      encoding: 'utf-8',
    });
    
    return {
      success: true,
      output: stdout.trim(),
      error: stderr.trim() || undefined,
    };
  } catch (error: any) {
    // rg returns exit code 1 for no matches
    if (error.code === 1 && error.stdout) {
      return {
        success: true,
        output: error.stdout.trim(),
        error: error.stderr.trim() || undefined,
      };
    }
    
    return {
      success: false,
      output: '',
      error: error.message || String(error),
    };
  }
}