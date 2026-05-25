/*
 * File: types.ts
 * Project: deepsproxy
 * Tool system types - re-exports from shared/types/openai.ts
 */

export type {
  JsonSchema,
  FunctionToolDefinition,
  ToolRegistration,
  ToolHandler,
  ToolExecutionContext as ToolContext,
  ParsedToolCall,
  ToolCallResult,
} from '../shared/types/openai.ts';
