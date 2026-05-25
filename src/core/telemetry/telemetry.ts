/*
 * File: telemetry.ts
 * Project: deepsproxy
 * Telemetry system to automatically detect and estimate model context window limits based on usage.
 */

export interface ModelTelemetry {
  detectedLimit: number; // in characters
  maxSuccessSize: number; // in characters
  minFailureSize: number; // in characters
}

const DEFAULT_CONTEXT_CHARACTERS = 64_000 * 3.5; // Roughly 224,000 characters (representing 64,000 tokens)
const MIN_CONTEXT_CHARACTERS = 50 * 3.5; // 175 characters (representing 50 tokens)

const telemetryStore: Record<string, ModelTelemetry> = (globalThis as any)._telemetryStore || {};
(globalThis as any)._telemetryStore = telemetryStore;

function initTelemetry(model: string): ModelTelemetry {
  if (!telemetryStore[model]) {
    telemetryStore[model] = {
      detectedLimit: DEFAULT_CONTEXT_CHARACTERS,
      maxSuccessSize: 0,
      minFailureSize: Infinity,
    };
  }
  return telemetryStore[model];
}

export function getModelTelemetry(model: string): ModelTelemetry {
  return initTelemetry(model);
}

export function getContextLength(model: string): number {
  const stats = initTelemetry(model);
  // Return in tokens (assuming roughly 3.5 characters per token)
  return Math.ceil(stats.detectedLimit / 3.5);
}

export function recordSuccess(model: string, promptSize: number): void {
  const stats = initTelemetry(model);
  stats.maxSuccessSize = Math.max(stats.maxSuccessSize, promptSize);
  
  // If the successful prompt was larger than our estimated limit, increase the limit
  if (promptSize > stats.detectedLimit) {
    stats.detectedLimit = promptSize;
  }
  
  // Ensure detectedLimit is not above minFailureSize if we have recorded a failure
  if (stats.detectedLimit >= stats.minFailureSize) {
    stats.detectedLimit = Math.floor(stats.minFailureSize * 0.95);
  }
  
  console.log(`[Telemetry] Recorded success for model '${model}'. Prompt size: ${promptSize} chars. Estimated context limit: ${stats.detectedLimit} chars (~${Math.ceil(stats.detectedLimit / 3.5)} tokens).`);
}

export function recordFailure(model: string, promptSize: number): void {
  const stats = initTelemetry(model);
  stats.minFailureSize = Math.min(stats.minFailureSize, promptSize);
  
  // On failure, adjust the estimated limit downwards.
  // We estimate the new limit as 85% of the failed prompt size
  const newLimit = Math.floor(promptSize * 0.85);
  
  // Do not let it drop below our safe minimum context size
  stats.detectedLimit = Math.max(MIN_CONTEXT_CHARACTERS, Math.min(stats.detectedLimit, newLimit));
  
  // Keep it above the maximum known success size
  if (stats.detectedLimit < stats.maxSuccessSize) {
    stats.detectedLimit = stats.maxSuccessSize;
  }
  
  console.log(`[Telemetry] Recorded failure for model '${model}'. Prompt size: ${promptSize} chars. Estimated context limit reduced to: ${stats.detectedLimit} chars (~${Math.ceil(stats.detectedLimit / 3.5)} tokens).`);
}

export interface RunMetrics {
  runId: string;
  model: string;
  startTime: number;
  endTime?: number;
  totalTokens: number;
  totalTurns: number;
  toolCalls: number;
  success: boolean;
  error?: string;
}

export class ExecutionTelemetryTracker {
  private static instance: ExecutionTelemetryTracker;
  private activeRuns = new Map<string, RunMetrics>();
  private completedRuns: RunMetrics[] = [];

  private constructor() {}

  public static getInstance(): ExecutionTelemetryTracker {
    if (!ExecutionTelemetryTracker.instance) {
      ExecutionTelemetryTracker.instance = new ExecutionTelemetryTracker();
    }
    return ExecutionTelemetryTracker.instance;
  }

  public startRun(runId: string, model: string) {
    this.activeRuns.set(runId, {
      runId,
      model,
      startTime: Date.now(),
      totalTokens: 0,
      totalTurns: 0,
      toolCalls: 0,
      success: false,
    });
  }

  public recordTurn(runId: string, tokens: number, toolCalls: number) {
    const run = this.activeRuns.get(runId);
    if (run) {
      run.totalTurns++;
      run.totalTokens += tokens;
      run.toolCalls += toolCalls;
    }
  }

  public endRun(runId: string, success: boolean, error?: string) {
    const run = this.activeRuns.get(runId);
    if (run) {
      run.endTime = Date.now();
      run.success = success;
      if (error) run.error = error;
      
      this.completedRuns.push(run);
      this.activeRuns.delete(runId);
      
      console.log(`[Telemetry] Run ${runId} ended. Success: ${success}, Duration: ${run.endTime - run.startTime}ms, Turns: ${run.totalTurns}, Tools: ${run.toolCalls}`);
    }
  }

  public getRunMetrics(runId: string): RunMetrics | undefined {
    return this.activeRuns.get(runId) || this.completedRuns.find(r => r.runId === runId);
  }

  public getMetricsSummary() {
    const totalRuns = this.completedRuns.length;
    const successfulRuns = this.completedRuns.filter(r => r.success).length;
    return {
      totalRuns,
      successfulRuns,
      failedRuns: totalRuns - successfulRuns,
      averageTurns: totalRuns ? this.completedRuns.reduce((acc, r) => acc + r.totalTurns, 0) / totalRuns : 0,
      averageTokens: totalRuns ? this.completedRuns.reduce((acc, r) => acc + r.totalTokens, 0) / totalRuns : 0,
    };
  }
}

