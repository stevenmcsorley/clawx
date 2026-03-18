/**
 * Extension system types for Clawx.
 * 
 * v1: Tool extensions only, loaded from ~/.clawx/extensions/
 */

export interface ExtensionManifest {
  /** Unique extension identifier (folder name) */
  name: string;
  
  /** Semantic version */
  version: string;
  
  /** Extension type - only 'tool' for v1 */
  type: 'tool';
  
  /** Whether the extension should be loaded */
  enabled: boolean;
  
  /** Human-readable description */
  description: string;
  
  /** Path to JavaScript entrypoint (relative to extension folder) */
  entrypoint: string;
  
  /** Optional dependencies (for documentation only in v1) */
  dependencies?: Record<string, string>;
  
  /** Tool metadata for registration */
  tool: {
    /** Tool name (used in tool calls) */
    name: string;
    
    /** Display label */
    label: string;
    
    /** Tool description for the model */
    description: string;
    
    /** JSON Schema parameters */
    parameters: any;
  };
}

/**
 * Result of loading an extension
 */
export interface LoadedExtension {
  /** Extension manifest */
  manifest: ExtensionManifest;
  
  /** Loaded tool definition */
  tool: ToolDefinition;
}

/**
 * Tool definition matching pi-coding-agent's expected shape
 */
export interface ToolDefinition {
  name: string;
  label: string;
  description: string;
  parameters: any;
  execute: (params: any) => Promise<any>;
}

/**
 * Validation error for extensions
 */
export class ExtensionError extends Error {
  constructor(
    message: string,
    public readonly extensionName?: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'ExtensionError';
  }
}