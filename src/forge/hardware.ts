// Forge v1: Simple hardware analysis

export interface HardwareInfo {
  gpu: boolean;
  memory: 'low' | 'medium' | 'high';
  feasibility: 'likely' | 'maybe' | 'probably heavy';
}

export function analyzeHardwareFeasibility(
  gpuRequired: boolean,
  memoryRequired: 'low' | 'medium' | 'high'
): HardwareInfo {
  // Simple feasibility assessment
  let feasibility: 'likely' | 'maybe' | 'probably heavy' = 'likely';
  
  if (gpuRequired) {
    feasibility = 'maybe'; // GPU not guaranteed
  }
  
  if (memoryRequired === 'high') {
    feasibility = 'probably heavy';
  } else if (memoryRequired === 'medium' && gpuRequired) {
    feasibility = 'maybe';
  }
  
  return {
    gpu: gpuRequired,
    memory: memoryRequired,
    feasibility
  };
}

export function getHardwareDescription(info: HardwareInfo): string {
  const parts: string[] = [];
  
  if (info.gpu) {
    parts.push('GPU');
  } else {
    parts.push('CPU');
  }
  
  parts.push(info.memory, 'memory');
  
  return `${parts.join(' ')} (${info.feasibility} locally)`;
}