// Forge v1 tests
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createOpportunity } from './rank.js';
import { createScaffoldPlan } from './scaffold.js';
import type { Asset, Opportunity } from './types.js';

// Mock data
const mockModel: Asset = {
  id: 'test/model',
  type: 'model',
  name: 'Test Model',
  author: 'test',
  downloads: 1000,
  tags: ['text-classification', 'pytorch'],
  task: 'text-classification',
  modality: 'text',
  license: 'mit',
  hardware: { gpu: false, memory: 'low' }
};

const mockDataset: Asset = {
  id: 'test/dataset',
  type: 'dataset',
  name: 'Test Dataset',
  author: 'test',
  downloads: 500,
  tags: ['text-classification'],
  task: 'text-classification',
  modality: 'text',
  license: 'cc-by-4.0',
  hardware: { gpu: false, memory: 'low' }
};

describe('Forge v1', () => {
  describe('opportunity ranking', () => {
    it('creates opportunity with correct shape', () => {
      const opportunity = createOpportunity(mockModel, mockDataset, 'test query');
      
      expect(opportunity).toHaveProperty('id');
      expect(opportunity.id).toMatch(/^opp_/);
      expect(opportunity.title).toBeTypeOf('string');
      expect(opportunity.description).toBeTypeOf('string');
      expect(opportunity.primaryModel).toEqual(mockModel);
      expect(opportunity.supportingDataset).toEqual(mockDataset);
      expect(opportunity.query).toBe('test query');
      expect(opportunity.createdAt).toBeTypeOf('string');
      
      // Scores
      expect(opportunity.scores).toEqual({
        usefulness: expect.any(Number),
        novelty: expect.any(Number),
        feasibility: expect.any(Number),
        fit: expect.any(Number),
        overall: expect.any(Number)
      });
      
      // All scores between 0 and 1
      Object.values(opportunity.scores).forEach(score => {
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      });
      
      // Possible outputs
      expect(opportunity.possibleOutputs).toBeInstanceOf(Array);
      expect(opportunity.possibleOutputs.length).toBeGreaterThan(0);
      opportunity.possibleOutputs.forEach(output => {
        expect(['tool', 'app']).toContain(output.type);
        expect(['low', 'medium', 'high']).toContain(output.complexity);
      });
    });
    
    it('creates opportunity without dataset', () => {
      const opportunity = createOpportunity(mockModel, undefined, 'test query');
      
      expect(opportunity.primaryModel).toEqual(mockModel);
      expect(opportunity.supportingDataset).toBeUndefined();
      expect(opportunity.description).toContain(mockModel.name);
    });
    
    it('scores are reasonable for test model', () => {
      const opportunity = createOpportunity(mockModel, mockDataset, 'test query');
      
      // Text classification with low hardware should have good feasibility
      expect(opportunity.scores.feasibility).toBeGreaterThan(0.5);
      
      // Text tasks should fit Clawx well
      expect(opportunity.scores.fit).toBeGreaterThan(0.5);
    });
  });
  
  describe('scaffold plan generation', () => {
    const mockOpportunity: Opportunity = {
      id: 'opp_test123',
      title: 'Test Opportunity',
      description: 'Test description',
      primaryModel: mockModel,
      supportingDataset: mockDataset,
      scores: {
        usefulness: 0.8,
        novelty: 0.6,
        feasibility: 0.9,
        fit: 0.7,
        overall: 0.75
      },
      possibleOutputs: [
        { type: 'tool', complexity: 'low' },
        { type: 'app', complexity: 'medium' }
      ],
      createdAt: '2024-01-01T00:00:00Z',
      query: 'test query'
    };
    
    it('creates tool scaffold plan', () => {
      const plan = createScaffoldPlan(mockOpportunity, {
        opportunityId: 'opp_test123',
        outputType: 'tool',
        outputName: 'test-tool',
        outputDir: './test-tool'
      });
      
      expect(plan.opportunityId).toBe('opp_test123');
      expect(plan.outputType).toBe('tool');
      expect(plan.outputName).toBe('test-tool');
      expect(plan.files).toBeInstanceOf(Array);
      expect(plan.files.length).toBeGreaterThan(0);
      expect(plan.integrationNotes).toBeTypeOf('string');
      
      // Check file structure
      const filePaths = plan.files.map(f => f.path);
      expect(filePaths).toContain('README.md');
      expect(filePaths).toContain('tool.json');
      expect(filePaths).toContain('tool.ts');
      expect(filePaths).toContain('package.json');
      
      // Check content contains opportunity data
      const readme = plan.files.find(f => f.path === 'README.md')!.content;
      expect(readme).toContain('test-tool');
      expect(readme).toContain(mockModel.name);
      expect(readme).toContain('Setup');
      
      const toolTs = plan.files.find(f => f.path === 'tool.ts')!.content;
      expect(toolTs).toContain('test-tool');
      expect(toolTs).toContain(mockModel.id);
    });
    
    it('creates app scaffold plan', () => {
      const plan = createScaffoldPlan(mockOpportunity, {
        opportunityId: 'opp_test123',
        outputType: 'app',
        outputName: 'test-app',
        outputDir: './test-app'
      });
      
      expect(plan.opportunityId).toBe('opp_test123');
      expect(plan.outputType).toBe('app');
      expect(plan.outputName).toBe('test-app');
      expect(plan.files).toBeInstanceOf(Array);
      expect(plan.files.length).toBeGreaterThan(0);
      expect(plan.integrationNotes).toBeUndefined();
      
      // Check file structure
      const filePaths = plan.files.map(f => f.path);
      expect(filePaths).toContain('README.md');
      expect(filePaths).toContain('app.py');
      expect(filePaths).toContain('requirements.txt');
      expect(filePaths).toContain('config.yaml');
      
      // Check content contains opportunity data
      const readme = plan.files.find(f => f.path === 'README.md')!.content;
      expect(readme).toContain('test-app');
      expect(readme).toContain(mockModel.name);
      
      const appPy = plan.files.find(f => f.path === 'app.py')!.content;
      expect(appPy).toContain('test-app');
      expect(appPy).toContain(mockModel.id);
    });
  });
  
  describe('scaffold file writing', () => {
    it('tool scaffold creates expected files', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const { executeScaffoldPlan } = await import('./scaffold.js');
      
      const mockOpportunity: Opportunity = {
        id: 'opp_test123',
        title: 'Test Opportunity',
        description: 'Test description',
        primaryModel: mockModel,
        supportingDataset: mockDataset,
        scores: {
          usefulness: 0.8,
          novelty: 0.6,
          feasibility: 0.9,
          fit: 0.7,
          overall: 0.75
        },
        possibleOutputs: [
          { type: 'tool', complexity: 'low' }
        ],
        createdAt: '2024-01-01T00:00:00Z',
        query: 'test query'
      };
      
      const plan = createScaffoldPlan(mockOpportunity, {
        opportunityId: 'opp_test123',
        outputType: 'tool',
        outputName: 'test-tool',
        outputDir: './test-scaffold-output'
      });
      
      // Clean up if exists
      if (fs.existsSync('./test-scaffold-output')) {
        fs.rmSync('./test-scaffold-output', { recursive: true });
      }
      
      // Execute scaffold
      executeScaffoldPlan(plan, './test-scaffold-output');
      
      // Check files exist
      expect(fs.existsSync('./test-scaffold-output')).toBe(true);
      expect(fs.existsSync('./test-scaffold-output/README.md')).toBe(true);
      expect(fs.existsSync('./test-scaffold-output/tool.json')).toBe(true);
      expect(fs.existsSync('./test-scaffold-output/tool.ts')).toBe(true);
      expect(fs.existsSync('./test-scaffold-output/package.json')).toBe(true);
      expect(fs.existsSync('./test-scaffold-output/test-data/example.txt')).toBe(true);
      
      // Clean up
      fs.rmSync('./test-scaffold-output', { recursive: true });
    });
  });
});