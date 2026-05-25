/*
 * File: engine.ts
 * Project: deepsproxy
 * Agent State Machine Engine - core orchestration loop
 * Manages phase transitions, LLM calls, tool execution, and event emission.
 */

import { v4 as uuidv4 } from "uuid";
import type {
  AgentState,
  AgentPhase,
  AgentConfig,
  AgentEvent,
  AgentEventListener,
  LLMAdapter,
  LLMResponse,
} from "./types.ts";
import type {
  Message,
  ParsedToolCall,
  ToolCallResult,
  FunctionToolDefinition,
} from "../../shared/types/openai.ts";
import { registry } from "../../tools/registry.ts";
import { SchemaValidationError } from "../../tools/schema.ts";

// ─── State Factory ─────────────────────────────────────────────────────────────

function createInitialState(
  model: string,
  stream: boolean,
  messages: Message[],
  tools: FunctionToolDefinition[],
  config: AgentConfig
): AgentState {
  const now = Date.now();
  return {
    phase: "idle",
    runId: uuidv4(),
    model,
    stream,
    messages: [...messages],
    tools,
    turn: 0,
    maxTurns: config.maxTurns ?? 10,
    pendingToolCalls: [],
    toolResults: [],
    finalContent: null,
    finishReason: null,
    usage: {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cachedTokens: 0,
    },
    error: null,
    timestamps: {
      created: now,
      started: undefined,
      completed: undefined,
      lastTurnAt: undefined,
      erroredAt: undefined,
    },
    state: config.initialState ? { ...config.initialState } : {},
  };
}

// ─── Tool Execution ────────────────────────────────────────────────────────────

const TOOL_START_TAG = '<' + 'tool_call>';
const TOOL_END_TAG = '</' + 'tool_call>';

export class AgentEngine {
  private state: AgentState;
  private listeners: AgentEventListener[] = [];

  constructor(
    model: string,
    stream: boolean,
    messages: Message[],
    tools: FunctionToolDefinition[],
    config: AgentConfig = {}
  ) {
    this.state = createInitialState(model, stream, messages, tools, config);
  }

  public addEventListener(listener: AgentEventListener) {
    this.listeners.push(listener);
  }

  private emit(event: Omit<AgentEvent, 'timestamp'>) {
    const fullEvent = { ...event, timestamp: Date.now() } as AgentEvent;
    this.listeners.forEach(l => {
      try {
        l(fullEvent);
      } catch (e) {
        console.error('[AgentEngine] Error in event listener:', e);
      }
    });

    this.logEvent(fullEvent);
  }

  private logEvent(event: AgentEvent) {
    const timeStr = new Date(event.timestamp).toISOString();
    switch (event.type) {
      case 'phase_change':
        console.log(`[${timeStr}] [Phase] ${event.from} -> ${event.to}`);
        break;
      case 'llm_request':
        console.log(`[${timeStr}] [LLM] Requesting turn ${event.turn} with ${event.messageCount} messages`);
        break;
      case 'llm_response':
        console.log(`[${timeStr}] [LLM] Response turn ${event.turn} - Content length: ${event.contentLength}, Tool Calls: ${event.toolCallCount}`);
        break;
      case 'tool_start':
        console.log(`[${timeStr}] [Tool] Starting '${event.toolName}' (ID: ${event.toolCallId}) at turn ${event.turn}`);
        break;
      case 'tool_end':
        console.log(`[${timeStr}] [Tool] Finished '${event.toolName}' (ID: ${event.toolCallId}) - Error: ${event.isError} - Duration: ${event.duration}ms`);
        break;
      case 'error':
        console.error(`[${timeStr}] [Error] Phase: ${event.phase} - ${event.code}: ${event.message}`);
        break;
      case 'completed':
        console.log(`[${timeStr}] [Completed] Turn: ${event.turn} - Total Tokens: ${event.totalTokens} - Duration: ${event.duration}ms`);
        break;
      case 'stream_chunk':
        // Mute stream chunk logging by default to avoid console spam
        break;
    }
  }

  public transitionTo(newPhase: AgentPhase) {
    const oldPhase = this.state.phase;
    this.state.phase = newPhase;
    this.emit({ type: 'phase_change', from: oldPhase, to: newPhase } as any);
  }

  public getState(): Readonly<AgentState> {
    return this.state;
  }
}