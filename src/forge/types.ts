// Forge v1: Minimal types only

// Asset (models + datasets only)
export interface Asset {
  id: string;           // "distilbert-base-uncased"
  type: 'model' | 'dataset';
  name: string;         // "DistilBERT base uncased"
  author: string;       // "huggingface"
  downloads: number;
  tags: string[];       // ["text-classification", "pytorch"]
  task?: string;        // "text-classification"
  modality?: string;    // "text"
  license?: string;     // "apache-2.0"
  hardware?: {
    gpu: boolean;
    memory: 'low' | 'medium' | 'high';
  };
}

// Opportunity (minimal)
export interface Opportunity {
  id: string;           // "opp_abc123"
  title: string;        // "Medical text classifier"
  description: string;  // "Classify medical texts using DistilBERT"
  
  // Core assets
  primaryModel: Asset;
  supportingDataset?: Asset;
  
  // Simple scores (0-1)
  scores: {
    usefulness: number;
    novelty: number;  
    feasibility: number; // likely/maybe/probably heavy
    fit: number;        // fits Clawx well
    overall: number;    // average
  };
  
  // Possible outputs
  possibleOutputs: Array<{
    type: 'tool' | 'app';
    complexity: 'low' | 'medium' | 'high';
  }>;
  
  // Metadata
  createdAt: string;
  query: string;
}

// ScaffoldPlan (just enough to generate)
export interface ScaffoldPlan {
  opportunityId: string;
  outputType: 'tool' | 'app';
  outputName: string;
  
  // Files to generate
  files: Array<{
    path: string;
    content: string;
  }>;
  
  // Simple integration notes (if tool)
  integrationNotes?: string;
}

// Storage for discovered opportunities
export interface ForgeStorage {
  opportunities: Opportunity[];
  lastDiscovery?: {
    query: string;
    timestamp: string;
    count: number;
  };
}