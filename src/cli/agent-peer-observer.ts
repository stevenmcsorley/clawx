import { readFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { log } from '../utils/logger.js';

function stripTimestampPrefix(line: string): string {
  return line.replace(/^\[[^\]]+\]\s*/, '').trim();
}

export async function startPeerObserverTui(workspace: string, agentName: string): Promise<void> {
  const logPath = join(workspace, 'peer-activity.log');
  let lastSize = existsSync(logPath) ? statSync(logPath).size : 0;

  process.stderr.write(`\n👀 Peer activity for ${agentName}\n`);
  process.stderr.write(`Watching ${logPath}\n\n`);

  setInterval(() => {
    try {
      if (!existsSync(logPath)) return;
      const stats = statSync(logPath);
      if (stats.size <= lastSize) return;
      const content = readFileSync(logPath, 'utf8');
      const delta = content.slice(lastSize);
      lastSize = stats.size;
      const lines = delta.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
      for (const line of lines) {
        process.stderr.write(`🌐 ${stripTimestampPrefix(line)}\n`);
      }
    } catch (error) {
      log.debug('peer observer poll failed:', error instanceof Error ? error.message : String(error));
    }
  }, 1000);

  await new Promise<void>(() => {});
}
