import { OpenAIRequest, ToolCall, Usage } from '../shared/types/index.ts';

export type EmitChunk = (data: any) => Promise<void>;

export interface ParsedCompletion {
  content: string;
  reasoningContent: string;
  toolCalls: ToolCall[];
  finishReason: string;
  usage: Usage;
}

export interface Provider {
  /** Unique identifier for the provider */
  readonly id: string;

  /** Initialize any required resources (e.g., Playwright contexts) */
  init(): Promise<void>;

  /** Close and cleanup resources */
  close(): Promise<void>;

  /** 
   * Handles the complete chat flow: sending the request, parsing the stream, 
   * emitting chunks (if streaming), and returning the final summary.
   */
  handleChatCompletion(
    request: OpenAIRequest,
    finalPrompt: string,
    completionId: string,
    emit?: EmitChunk
  ): Promise<ParsedCompletion>;
}
