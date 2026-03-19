/**
 * gRPC Task Executor
 * 
 * Replaces HTTP/SSE task execution with gRPC-based execution
 * Handles task requests from master to workers via gRPC
 */

import { log } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import type { AgentTask } from '../types/agent.js';
import type { GrpcServer } from './grpc/grpc-server.js';
import { GrpcFrames } from './grpc/protocol.js';

export interface GrpcTaskExecutorOptions {
  grpcServer: GrpcServer;
  workspace: string;
  allowedTools: string[];
}

export class GrpcTaskExecutor {
  private tasks = new Map<string, AgentTask>();
  private pendingWorkerTasks = new Map<string, Set<string>>(); // workerId -> taskIds
  
  constructor(private options: GrpcTaskExecutorOptions) {}
  
  /**
   * Execute a task on a worker via gRPC
   */
  async executeTaskOnWorker(
    taskId: string,
    tool: string,
    params: any,
    context: any,
    workerId: string
  ): Promise<void> {
    const task: AgentTask = {
      id: taskId,
      agentId: workerId,
      type: 'execute',
      payload: { tool, params, context },
      status: 'pending',
      created: Date.now(),
    };
    
    this.tasks.set(taskId, task);
    
    // Track task for this worker
    if (!this.pendingWorkerTasks.has(workerId)) {
      this.pendingWorkerTasks.set(workerId, new Set());
    }
    this.pendingWorkerTasks.get(workerId)!.add(taskId);
    
    // Send task to worker via gRPC
    const sent = this.options.grpcServer.sendTask(
      workerId,
      taskId,
      tool,
      params,
      context
    );
    
    if (!sent) {
      task.status = 'failed';
      task.completed = Date.now();
      task.error = `Worker ${workerId} not connected via gRPC`;
      throw new Error(task.error);
    }
    
    task.status = 'running';
    task.started = Date.now();
    
    // Return immediately - worker will send progress via gRPC
    log.info(`Task ${taskId} sent to worker ${workerId} via gRPC: ${tool}`);
  }
  
  /**
   * Handle task progress from worker
   */
  handleTaskProgress(
    workerId: string,
    taskId: string,
    progress: number,
    message: string
  ): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      log.warn(`Received progress for unknown task ${taskId} from worker ${workerId}`);
      return;
    }
    
    log.debug(`Task ${taskId} progress: ${progress}% - ${message}`);
    
    // Could emit event for UI updates
    // For now, just log
  }
  
  /**
   * Handle tool output from worker
   */
  handleToolOutput(
    workerId: string,
    taskId: string,
    type: 'stdout' | 'stderr',
    data: string
  ): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      log.warn(`Received tool output for unknown task ${taskId} from worker ${workerId}`);
      return;
    }
    
    log.debug(`Task ${taskId} tool ${type}: ${data.substring(0, 200)}...`);
    
    // Could emit event for UI updates
    // For now, just log
  }
  
  /**
   * Handle task completion from worker
   */
  handleTaskCompleted(
    workerId: string,
    taskId: string,
    result: any
  ): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      log.warn(`Received completion for unknown task ${taskId} from worker ${workerId}`);
      return;
    }
    
    task.status = 'completed';
    task.completed = Date.now();
    task.result = result;
    
    // Clean up worker tracking
    const workerTasks = this.pendingWorkerTasks.get(workerId);
    if (workerTasks) {
      workerTasks.delete(taskId);
      if (workerTasks.size === 0) {
        this.pendingWorkerTasks.delete(workerId);
      }
    }
    
    log.info(`Task ${taskId} completed by worker ${workerId}: ${JSON.stringify(result).substring(0, 200)}...`);
  }
  
  /**
   * Handle task failure from worker
   */
  handleTaskFailed(
    workerId: string,
    taskId: string,
    error: string
  ): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      log.warn(`Received failure for unknown task ${taskId} from worker ${workerId}`);
      return;
    }
    
    task.status = 'failed';
    task.completed = Date.now();
    task.error = error;
    
    // Clean up worker tracking
    const workerTasks = this.pendingWorkerTasks.get(workerId);
    if (workerTasks) {
      workerTasks.delete(taskId);
      if (workerTasks.size === 0) {
        this.pendingWorkerTasks.delete(workerId);
      }
    }
    
    log.error(`Task ${taskId} failed by worker ${workerId}: ${error}`);
  }
  
  /**
   * Get task status
   */
  getTaskStatus(taskId: string): AgentTask | undefined {
    return this.tasks.get(taskId);
  }
  
  /**
   * Cancel a task
   */
  cancelTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    
    if (task.status === 'running' || task.status === 'pending') {
      task.status = 'cancelled';
      task.completed = Date.now();
      
      // Send cancellation to worker via gRPC
      // TODO: Implement task cancellation
      
      return true;
    }
    
    return false;
  }
  
  /**
   * Get all tasks for a worker
   */
  getWorkerTasks(workerId: string): AgentTask[] {
    const taskIds = this.pendingWorkerTasks.get(workerId);
    if (!taskIds) return [];
    
    return Array.from(taskIds)
      .map(taskId => this.tasks.get(taskId))
      .filter((task): task is AgentTask => !!task);
  }
  
  /**
   * Clean up old tasks
   */
  cleanupOldTasks(maxAgeMs: number = 3600000): void { // 1 hour default
    const now = Date.now();
    const toDelete: string[] = [];
    
    for (const [taskId, task] of this.tasks.entries()) {
      if (task.completed && now - task.completed > maxAgeMs) {
        toDelete.push(taskId);
      }
    }
    
    for (const taskId of toDelete) {
      this.tasks.delete(taskId);
      
      // Also clean up from worker tracking
      for (const [workerId, taskIds] of this.pendingWorkerTasks.entries()) {
        taskIds.delete(taskId);
        if (taskIds.size === 0) {
          this.pendingWorkerTasks.delete(workerId);
        }
      }
    }
    
    if (toDelete.length > 0) {
      log.debug(`Cleaned up ${toDelete.length} old tasks`);
    }
  }
}