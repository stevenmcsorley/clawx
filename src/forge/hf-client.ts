// Forge v1: HF API client (models + datasets only)

import { Asset } from './types.js';

const HF_API_BASE = 'https://huggingface.co/api';

export interface HFSearchParams {
  query: string;
  limit?: number;
  type?: 'model' | 'dataset';
}

export async function searchModels(query: string, limit: number = 20): Promise<Asset[]> {
  const url = new URL(`${HF_API_BASE}/models`);
  url.searchParams.set('search', query);
  url.searchParams.set('limit', limit.toString());
  url.searchParams.set('sort', 'downloads');
  url.searchParams.set('direction', '-1');
  
  try {
    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`HF API error: ${response.status}`);
    }
    
    const data = await response.json() as any[];
    return data.map(convertHFModelToAsset);
    
  } catch (error) {
    console.error('Failed to search models:', error);
    return [];
  }
}

export async function searchDatasets(query: string, limit: number = 10): Promise<Asset[]> {
  const url = new URL(`${HF_API_BASE}/datasets`);
  url.searchParams.set('search', query);
  url.searchParams.set('limit', limit.toString());
  url.searchParams.set('sort', 'downloads');
  url.searchParams.set('direction', '-1');
  
  try {
    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`HF API error: ${response.status}`);
    }
    
    const data = await response.json() as any[];
    return data.map(convertHFDatasetToAsset);
    
  } catch (error) {
    console.error('Failed to search datasets:', error);
    return [];
  }
}

function convertHFModelToAsset(hfModel: any): Asset {
  return {
    id: hfModel.id,
    type: 'model',
    name: hfModel.id.split('/').pop() || hfModel.id,
    author: hfModel.id.split('/')[0] || 'unknown',
    downloads: hfModel.downloads || 0,
    tags: hfModel.tags || [],
    task: hfModel.pipeline_tag,
    modality: extractModality(hfModel.tags),
    license: hfModel.license,
    hardware: estimateHardwareRequirements(hfModel)
  };
}

function convertHFDatasetToAsset(hfDataset: any): Asset {
  return {
    id: hfDataset.id,
    type: 'dataset',
    name: hfDataset.id.split('/').pop() || hfDataset.id,
    author: hfDataset.id.split('/')[0] || 'unknown',
    downloads: hfDataset.downloads || 0,
    tags: hfDataset.tags || [],
    task: extractDatasetTask(hfDataset.tags),
    modality: extractModality(hfDataset.tags),
    license: hfDataset.license,
    hardware: { gpu: false, memory: 'low' } // Datasets don't need GPU
  };
}

function extractModality(tags: string[]): string {
  const modalities = ['text', 'image', 'audio', 'video', 'multimodal'];
  for (const modality of modalities) {
    if (tags.includes(modality)) return modality;
  }
  return 'text'; // Default
}

function extractDatasetTask(tags: string[]): string {
  const tasks = ['text-classification', 'text-generation', 'image-classification', 
                 'object-detection', 'speech-recognition', 'translation'];
  for (const task of tasks) {
    if (tags.includes(task)) return task;
  }
  return '';
}

function estimateHardwareRequirements(hfModel: any): { gpu: boolean; memory: 'low' | 'medium' | 'high' } {
  const tags = hfModel.tags || [];
  const size = hfModel.safetensors?.total || 0;
  
  // Check if model likely needs GPU
  let gpu = tags.includes('gpu') || 
            tags.includes('cuda') || 
            size > 500 * 1024 * 1024; // >500MB
  
  // Estimate memory requirements
  let memory: 'low' | 'medium' | 'high' = 'low';
  if (size > 1000 * 1024 * 1024) memory = 'high';
  else if (size > 200 * 1024 * 1024) memory = 'medium';
  
  return { gpu, memory };
}