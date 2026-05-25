import { OpenAIRequest, ToolCall, Usage } from '../shared/types/index.ts';

export type EmitChunk = (data: any) => Promise<void>;

export interface ParsedCompletion {
  content: string;
  reasoningContent: string;
  toolCalls: ToolCall[];
  finishReason: string;
  usage: Usage;
}

export abstract class BaseProvider {
  /** 
   * Unique identifier for the provider (e.g., 'deepseek', 'huggingface')
   */
  abstract readonly id: string;

  /** 
   * Initialize any required resources for the provider.
   * For web-based providers, this typically initializes Playwright contexts.
   */
  abstract init(): Promise<void>;

  /** 
   * Close and cleanup resources held by this provider.
   * Ensures secure wipe of temporary profile data if applicable.
   */
  abstract close(): Promise<void>;

  /** 
   * Handles the complete chat flow: sending the request, parsing the stream, 
   * emitting chunks (if streaming), and returning the final summary.
   * 
   * @param request The normalized OpenAI chat completion request.
   * @param finalPrompt The serialized prompt ready for the provider.
   * @param completionId Unique ID for this generation.
   * @param emit Optional callback to stream chunks back to the client.
   * @returns The fully parsed completion results including tool calls and usage.
   */
  abstract handleChatCompletion(
    request: OpenAIRequest,
    finalPrompt: string,
    completionId: string,
    emit?: EmitChunk
  ): Promise<ParsedCompletion>;
}

