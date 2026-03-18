// Forge v1: Discovery engine (models + datasets only)

import { Asset, Opportunity, ForgeStorage } from './types.js';
import { searchModels, searchDatasets } from './hf-client.js';
import { createOpportunity } from './rank.js';
import { join } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';

const FORGE_DIR = join(process.env.HOME || process.env.USERPROFILE || '.', '.clawx', 'forge');
const STORAGE_FILE = join(FORGE_DIR, 'storage.json');

export interface DiscoverOptions {
  query: string;
  limit?: number;
}

export async function discoverOpportunities(options: DiscoverOptions): Promise<Opportunity[]> {
  const { query, limit = 20 } = options;
  
  console.log(`🔍 Searching HF Hub for: "${query}"`);
  
  // Search for models and datasets
  const [models, datasets] = await Promise.all([
    searchModels(query, Math.ceil(limit * 0.7)), // 70% models
    searchDatasets(query, Math.ceil(limit * 0.3)) // 30% datasets
  ]);
  
  console.log(`📊 Found ${models.length} models and ${datasets.length} datasets`);
  
  // Create opportunities from combinations
  const opportunities: Opportunity[] = [];
  
  // 1. Model-only opportunities
  for (const model of models.slice(0, 10)) {
    opportunities.push(createOpportunity(model, undefined, query));
  }
  
  // 2. Model + dataset opportunities (if we have datasets)
  if (datasets.length > 0) {
    for (const model of models.slice(0, 5)) {
      for (const dataset of datasets.slice(0, 3)) {
        // Only pair if they share modality or task
        if (shouldPair(model, dataset)) {
          opportunities.push(createOpportunity(model, dataset, query));
        }
      }
    }
  }
  
  // Sort by overall score
  opportunities.sort((a, b) => b.scores.overall - a.scores.overall);
  
  // Take top N
  const topOpportunities = opportunities.slice(0, limit);
  
  // Save to storage
  saveOpportunities(topOpportunities, query);
  
  return topOpportunities;
}

function shouldPair(model: Asset, dataset: Asset): boolean {
  // Pair if they share modality
  if (model.modality && dataset.modality && model.modality === dataset.modality) {
    return true;
  }
  
  // Pair if they share task
  if (model.task && dataset.task && model.task === dataset.task) {
    return true;
  }
  
  // Pair if dataset tags mention model's task
  if (model.task && dataset.tags.some(tag => tag.includes(model.task!))) {
    return true;
  }
  
  return false;
}

function saveOpportunities(opportunities: Opportunity[], query: string) {
  try {
    // Ensure directory exists
    if (!existsSync(FORGE_DIR)) {
      mkdirSync(FORGE_DIR, { recursive: true });
    }
    
    // Load existing storage or create new
    let storage: ForgeStorage = { opportunities: [] };
    if (existsSync(STORAGE_FILE)) {
      try {
        const content = readFileSync(STORAGE_FILE, 'utf8');
        storage = JSON.parse(content);
      } catch (e) {
        console.warn('Could not parse existing storage, creating new');
      }
    }
    
    // Add new opportunities (avoid duplicates)
    const existingIds = new Set(storage.opportunities.map(o => o.id));
    const newOpportunities = opportunities.filter(o => !existingIds.has(o.id));
    
    storage.opportunities = [...newOpportunities, ...storage.opportunities];
    
    // Keep only last 100 opportunities
    if (storage.opportunities.length > 100) {
      storage.opportunities = storage.opportunities.slice(0, 100);
    }
    
    // Update last discovery
    storage.lastDiscovery = {
      query,
      timestamp: new Date().toISOString(),
      count: opportunities.length
    };
    
    // Save to file
    writeFileSync(STORAGE_FILE, JSON.stringify(storage, null, 2), 'utf8');
    
    console.log(`💾 Saved ${newOpportunities.length} new opportunities to ${STORAGE_FILE}`);
    
  } catch (error) {
    console.error('Failed to save opportunities:', error);
  }
}

export function loadOpportunities(): Opportunity[] {
  try {
    if (!existsSync(STORAGE_FILE)) {
      return [];
    }
    
    const content = readFileSync(STORAGE_FILE, 'utf8');
    const storage: ForgeStorage = JSON.parse(content);
    return storage.opportunities || [];
    
  } catch (error) {
    console.error('Failed to load opportunities:', error);
    return [];
  }
}

export function findOpportunity(id: string): Opportunity | undefined {
  const opportunities = loadOpportunities();
  return opportunities.find(o => o.id === id);
}

export function listOpportunities(options?: {
  sort?: 'overall' | 'usefulness' | 'novelty' | 'feasibility' | 'fit';
  minScore?: number;
  limit?: number;
}): Opportunity[] {
  let opportunities = loadOpportunities();
  
  // Filter by minimum score
  if (options?.minScore !== undefined) {
    opportunities = opportunities.filter(o => o.scores.overall >= options.minScore!);
  }
  
  // Sort
  const sortField = options?.sort || 'overall';
  opportunities.sort((a, b) => {
    if (sortField === 'overall') {
      return b.scores.overall - a.scores.overall;
    }
    return b.scores[sortField] - a.scores[sortField];
  });
  
  // Limit
  if (options?.limit !== undefined) {
    opportunities = opportunities.slice(0, options.limit);
  }
  
  return opportunities;
}