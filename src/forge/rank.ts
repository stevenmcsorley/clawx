// Forge v1: Simple ranking algorithm

import { Asset, Opportunity } from './types.js';

export function createOpportunity(
  model: Asset,
  dataset: Asset | undefined,
  query: string
): Opportunity {
  const id = `opp_${generateId()}`;
  const title = generateTitle(model, dataset);
  const description = generateDescription(model, dataset);
  
  const scores = scoreOpportunity(model, dataset);
  
  const possibleOutputs = determinePossibleOutputs(model, dataset);
  
  return {
    id,
    title,
    description,
    primaryModel: model,
    supportingDataset: dataset,
    scores,
    possibleOutputs,
    createdAt: new Date().toISOString(),
    query
  };
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 8);
}

function generateTitle(model: Asset, dataset?: Asset): string {
  const modelName = model.name.replace(/-/g, ' ');
  const task = model.task || 'processing';
  
  if (dataset) {
    const datasetName = dataset.name.replace(/-/g, ' ');
    return `${modelName} ${task} for ${datasetName}`;
  }
  
  return `${modelName} ${task}`;
}

function generateDescription(model: Asset, dataset?: Asset): string {
  const task = model.task || 'process data';
  const modality = model.modality || 'data';
  
  if (dataset) {
    return `Use ${model.name} to ${task} on ${dataset.name} ${modality} data`;
  }
  
  return `Use ${model.name} to ${task} ${modality} data`;
}

function scoreOpportunity(model: Asset, dataset?: Asset) {
  const usefulness = scoreUsefulness(model, dataset);
  const novelty = scoreNovelty(model, dataset);
  const feasibility = scoreFeasibility(model);
  const fit = scoreFit(model);
  const overall = (usefulness + novelty + feasibility + fit) / 4;
  
  return {
    usefulness: round(usefulness),
    novelty: round(novelty),
    feasibility: round(feasibility),
    fit: round(fit),
    overall: round(overall)
  };
}

function scoreUsefulness(model: Asset, dataset?: Asset): number {
  let score = 0;
  
  // Model downloads (log scale)
  if (model.downloads > 1000000) score += 0.4;
  else if (model.downloads > 100000) score += 0.3;
  else if (model.downloads > 10000) score += 0.2;
  else if (model.downloads > 1000) score += 0.1;
  
  // Dataset adds usefulness
  if (dataset) score += 0.2;
  
  // Common tasks are more useful
  const usefulTasks = ['text-classification', 'text-generation', 'translation', 
                       'image-classification', 'object-detection'];
  if (model.task && usefulTasks.includes(model.task)) score += 0.2;
  
  return Math.min(score, 1.0);
}

function scoreNovelty(model: Asset, dataset?: Asset): number {
  let score = 0.5; // Start at middle
  
  // Less popular models are more novel
  if (model.downloads < 10000) score += 0.3;
  else if (model.downloads > 100000) score -= 0.2;
  
  // Combination with dataset adds novelty
  if (dataset) score += 0.2;
  
  // Newer modalities are more novel
  const novelModalities = ['audio', 'video', 'multimodal'];
  if (model.modality && novelModalities.includes(model.modality)) score += 0.2;
  
  return Math.max(0, Math.min(score, 1.0));
}

function scoreFeasibility(model: Asset): number {
  let score = 1.0;
  
  // Hardware requirements reduce feasibility
  if (model.hardware?.gpu) score -= 0.3;
  if (model.hardware?.memory === 'high') score -= 0.3;
  else if (model.hardware?.memory === 'medium') score -= 0.15;
  
  // Large models are less feasible
  if (model.downloads > 500000) score -= 0.1;
  
  return Math.max(0.1, score);
}

function scoreFit(model: Asset): number {
  let score = 0.5;
  
  // Text-based tasks fit Clawx well
  if (model.modality === 'text') score += 0.3;
  
  // Classification/generation tasks fit well
  const goodTasks = ['text-classification', 'text-generation', 'translation'];
  if (model.task && goodTasks.includes(model.task)) score += 0.2;
  
  // CLI-friendly tasks
  const cliTasks = ['text-classification', 'translation', 'summarization'];
  if (model.task && cliTasks.includes(model.task)) score += 0.1;
  
  return Math.min(score, 1.0);
}

function determinePossibleOutputs(model: Asset, dataset?: Asset) {
  const outputs: Array<{type: 'tool' | 'app'; complexity: 'low' | 'medium' | 'high'}> = [];
  
  // Always possible as a tool
  outputs.push({
    type: 'tool',
    complexity: model.hardware?.memory === 'high' ? 'high' : 
                model.hardware?.gpu ? 'medium' : 'low'
  });
  
  // Usually possible as an app
  outputs.push({
    type: 'app',
    complexity: dataset ? 'medium' : 'low'
  });
  
  return outputs;
}

function round(num: number): number {
  return Math.round(num * 100) / 100;
}