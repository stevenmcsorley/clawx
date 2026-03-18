/**
 * Extension loader for Clawx.
 * 
 * Loads tool extensions from ~/.clawx/extensions/
 * Only loads enabled extensions with valid .js entrypoints.
 * Skips broken extensions safely.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ExtensionManifest, LoadedExtension, ToolDefinition } from '../types/extension.js';
import { ExtensionError } from '../types/extension.js';
import { log } from '../utils/logger.js';

/**
 * Find all extension directories in the extensions root
 */
async function findExtensionDirs(extensionsRoot: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(extensionsRoot, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory())
      .map(entry => path.join(extensionsRoot, entry.name));
  } catch (error) {
    // If extensions directory doesn't exist, that's OK
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/**
 * Load and validate an extension manifest
 */
async function loadManifest(extensionDir: string): Promise<ExtensionManifest> {
  const manifestPath = path.join(extensionDir, 'capability.json');
  
  try {
    const content = await fs.readFile(manifestPath, 'utf-8');
    const manifest = JSON.parse(content) as ExtensionManifest;
    
    // Basic validation
    if (!manifest.name) {
      throw new ExtensionError('Missing name field', path.basename(extensionDir));
    }
    
    if (manifest.type !== 'tool') {
      throw new ExtensionError(`Unsupported type: ${manifest.type}`, manifest.name);
    }
    
    if (typeof manifest.enabled !== 'boolean') {
      throw new ExtensionError('Missing or invalid enabled field', manifest.name);
    }
    
    if (!manifest.entrypoint) {
      throw new ExtensionError('Missing entrypoint field', manifest.name);
    }
    
    if (!manifest.entrypoint.endsWith('.js')) {
      throw new ExtensionError('Entrypoint must be a .js file', manifest.name);
    }
    
    if (!manifest.tool?.name) {
      throw new ExtensionError('Missing tool metadata', manifest.name);
    }
    
    return manifest;
  } catch (error) {
    if (error instanceof ExtensionError) {
      throw error;
    }
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new ExtensionError('Missing capability.json', path.basename(extensionDir));
    }
    throw new ExtensionError(
      `Failed to load manifest: ${error instanceof Error ? error.message : String(error)}`,
      path.basename(extensionDir),
      error as Error
    );
  }
}

/**
 * Load tool from extension entrypoint
 */
async function loadTool(extensionDir: string, manifest: ExtensionManifest): Promise<ToolDefinition> {
  const entrypointPath = path.join(extensionDir, manifest.entrypoint);
  
  try {
    // Check if entrypoint exists
    await fs.access(entrypointPath);
    
    // Dynamic import the module
    // Note: file:// URL is required for Windows compatibility
    const moduleUrl = `file://${entrypointPath}`;
    const module = await import(moduleUrl);
    
    if (!module.default) {
      throw new ExtensionError('Module must export default tool definition', manifest.name);
    }
    
    const tool = module.default as ToolDefinition;
    
    // Validate tool shape
    if (!tool.name || !tool.execute || typeof tool.execute !== 'function') {
      throw new ExtensionError('Invalid tool definition (missing name or execute)', manifest.name);
    }
    
    // Ensure tool name matches manifest
    if (tool.name !== manifest.tool.name) {
      log.warn(`Tool name mismatch: manifest=${manifest.tool.name}, export=${tool.name}. Using export name.`);
    }
    
    return tool;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new ExtensionError(`Entrypoint not found: ${manifest.entrypoint}`, manifest.name);
    }
    throw new ExtensionError(
      `Failed to load tool: ${error instanceof Error ? error.message : String(error)}`,
      manifest.name,
      error as Error
    );
  }
}

/**
 * Load a single extension
 */
async function loadExtension(extensionDir: string): Promise<LoadedExtension | null> {
  const extensionName = path.basename(extensionDir);
  
  try {
    const manifest = await loadManifest(extensionDir);
    
    // Skip disabled extensions
    if (!manifest.enabled) {
      log.debug(`Extension ${extensionName} is disabled`);
      return null;
    }
    
    log.info(`Loading extension: ${extensionName} (${manifest.version})`);
    
    const tool = await loadTool(extensionDir, manifest);
    
    return { manifest, tool };
  } catch (error) {
    if (error instanceof ExtensionError) {
      log.warn(`Skipping extension ${extensionName}: ${error.message}`);
    } else {
      log.warn(`Skipping extension ${extensionName}: ${error instanceof Error ? error.message : String(error)}`);
    }
    return null;
  }
}

/**
 * Load all enabled extensions from the extensions directory
 */
export async function loadExtensions(extensionsRoot: string): Promise<ToolDefinition[]> {
  log.info(`Loading extensions from: ${extensionsRoot}`);
  
  const extensionDirs = await findExtensionDirs(extensionsRoot);
  const tools: ToolDefinition[] = [];
  
  for (const extensionDir of extensionDirs) {
    const loaded = await loadExtension(extensionDir);
    if (loaded) {
      tools.push(loaded.tool);
    }
  }
  
  log.info(`Loaded ${tools.length} extension(s)`);
  return tools;
}

/**
 * Get the default extensions directory
 */
export function getDefaultExtensionsDir(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return path.join(home, '.clawx', 'extensions');
}