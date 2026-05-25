import { OpenAIRequest, Message, ToolCall, Usage, FunctionToolDefinition, ChoiceDelta, Choice, ChatCompletionChunk, ParsedToolCall } from '../types/index.ts';
import { robustParseJSON } from './json.ts';

export const TOOL_START = '<tool_call>';
export const TOOL_END = '</tool_call>';
export const TOOL_OPEN_RE = /<tool_call\b[^>]*>/i;

/**
 * Converts message content (string or array of parts) into a single string.
 */
export function messageContentToString(content: unknown): string {
  if (Array.isArray(content)) {
    return content.map((c: any) => c.text || JSON.stringify(c)).join('\n');
  }
  if (typeof content === 'object' && content !== null) {
    return JSON.stringify(content);
  }
  return typeof content === 'string' ? content : '';
}

export function serializeOpenAIMessages(messages: Message[]) {
  let prompt = '';
  let systemPrompt = '';

  for (const msg of messages) {
    const contentStr = messageContentToString(msg.content);

    if (msg.role === 'system') {
      systemPrompt += contentStr + '\n\n';
      continue;
    }

    if (msg.role === 'user') {
      prompt += `User: ${contentStr}\n\n`;
      continue;
    }

    if (msg.role === 'assistant') {
      let assistantContent = contentStr;
      if ((msg as any).reasoning_content) {
        assistantContent = `<think>\n${(msg as any).reasoning_content}\n</think>\n${assistantContent}`;
      }
      if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
        for (const tc of msg.tool_calls) {
          let args = tc.function?.arguments || '{}';
          if (typeof args !== 'string') args = JSON.stringify(args);
          assistantContent += `\n<tool_call>{"name": "${tc.function?.name}", "arguments": ${args}}</tool_call>`;
        }
      }
      prompt += `Assistant: ${assistantContent.trim()}\n\n`;
      continue;
    }

    if (msg.role === 'tool' || msg.role === 'function') {
      prompt += `Tool Response (${msg.name || msg.tool_call_id || 'tool'}): ${contentStr}\n\n`;
      continue;
    }

    prompt += `${msg.role}: ${contentStr}\n\n`;
  }

  return { prompt, systemPrompt };
}

/**
 * Appends tool definitions and instructions to the system prompt.
 */
export function appendToolInstructions(systemPrompt: string, body: OpenAIRequest): string {
  if (!body.tools || !Array.isArray(body.tools) || body.tools.length === 0) {
    return systemPrompt;
  }

  const formattedTools = body.tools.map((t: FunctionToolDefinition) => {
    if (t.type === 'function') {
      return {
        name: t.function.name,
        description: t.function.description || '',
        parameters: t.function.parameters
      };
    }
    return t;
  });
  const toolsJson = JSON.stringify(formattedTools, null, 2);

  systemPrompt += `\n\n# TOOLS AVAILABLE\nYou have access to the following tools:\n${toolsJson}\n\nTo use a tool, you MUST output a JSON object wrapped EXACTLY in these tags:\n<tool_call>\n{"name": "tool_name", "arguments": {"param_name": "value"}}\n</tool_call>\n\nRULES:\n1. You can call multiple tools by outputting multiple <tool_call> blocks consecutively.\n2. Do NOT output any other text after your <tool_call> blocks. Wait for the user to provide the tool response.\n3. The JSON must be valid and accurately follow the tool's parameters.\n\n`;

  if (body.tool_choice && typeof body.tool_choice === 'object' && body.tool_choice.type === 'function' && body.tool_choice.function) {
    const forcedTool = body.tool_choice.function.name;
    systemPrompt += `CRITICAL: You MUST call the tool "${forcedTool}" in this response.\n\n`;
  }

  return systemPrompt;
}

export function decodeXmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

export function coerceParameterValue(rawValue: string): unknown {
  const value = decodeXmlEntities(rawValue.trim());
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  if ((value.startsWith('{') && value.endsWith('}')) || (value.startsWith('[') && value.endsWith(']'))) {
    try { return JSON.parse(value); } catch {}
  }
  return value;
}

export function extractToolName(openTag: string, block: string): string {
  const combined = `${openTag}\n${block}`;
  const attrMatch = combined.match(/<tool_call\b[^>]*\bname\s*=\s*["']([^"']+)["']/i);
  if (attrMatch) return attrMatch[1];

  const nameTagMatch = block.match(/<name>([\s\S]*?)<\/name>/i);
  if (nameTagMatch) return decodeXmlEntities(nameTagMatch[1].trim());

  return '';
}

export function inferToolNameFromParameters(args: Record<string, unknown>, tools: FunctionToolDefinition[]): string {
  const argKeys = Object.keys(args);
  if (argKeys.length === 0 || !Array.isArray(tools)) return '';

  const matches = tools.filter((tool: FunctionToolDefinition) => {
    const fn = tool.function;
    const properties = fn?.parameters?.properties || {};
    return argKeys.every(k => Object.prototype.hasOwnProperty.call(properties, k));
  });

  if (matches.length === 1) {
    const fn = matches[0].function;
    return fn?.name || '';
  }

  return '';
}

export function parseXmlParameterToolCall(block: string, openTag: string, tools: FunctionToolDefinition[]): Partial<ParsedToolCall> | null {
  const args: Record<string, unknown> = {};
  const parameterRe = /<parameter\b[^>]*\bname\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/parameter>/gi;
  let match: RegExpExecArray | null;
  while ((match = parameterRe.exec(block)) !== null) {
    args[match[1]] = coerceParameterValue(match[2]);
  }

  if (Object.keys(args).length === 0) return null;

  const toolName = extractToolName(openTag, block) || inferToolNameFromParameters(args, tools);
  if (!toolName) return null;

  return { name: toolName, arguments: args };
}

export function parseToolCallBlock(block: string, openTag: string, tools: FunctionToolDefinition[]): Partial<ParsedToolCall> {
  const parsedXml = parseXmlParameterToolCall(block, openTag, tools);
  if (parsedXml) return parsedXml;

  const parsedJson = robustParseJSON<Partial<ParsedToolCall>>(block);
  if (!parsedJson) throw new Error('Empty tool call');

  const attrToolName = extractToolName(openTag, block);
  if (attrToolName && !parsedJson.name) parsedJson.name = attrToolName;

  return parsedJson;
}

export function findToolOpen(buffer: string): { startIdx: number; endIdx: number; openTag: string } | null {
  const match = buffer.match(TOOL_OPEN_RE);
  if (!match || match.index === undefined) return null;
  return {
    startIdx: match.index,
    endIdx: match.index + match[0].length,
    openTag: match[0]
  };
}

export function findPartialToolOpenIndex(buffer: string): number {
  const lower = buffer.toLowerCase();
  const idx = lower.lastIndexOf('<tool_call');
  if (idx !== -1 && lower.indexOf('>', idx) === -1) return idx;

  for (let i = 1; i < TOOL_START.length; i++) {
    if (lower.endsWith(TOOL_START.substring(0, i))) return buffer.length - i;
  }
  return -1;
}

export function makeChoice(delta: ChoiceDelta, finishReason: string | null = null): Choice {
  return {
    index: 0,
    delta,
    finish_reason: finishReason
  };
}

export function makeChunk(completionId: string, model: string, delta: ChoiceDelta, finishReason: string | null = null, usage?: Usage): ChatCompletionChunk {
  const chunk: ChatCompletionChunk = {
    id: completionId,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [makeChoice(delta, finishReason)]
  };
  if (usage) chunk.usage = usage;
  return chunk;
}
