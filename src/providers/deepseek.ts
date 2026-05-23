import { Provider, ParsedCompletion, EmitChunk } from './base.ts';
import { OpenAIRequest, ToolCall, ChoiceDelta, Usage } from '../shared/types/index.ts';
import { getActivePage, getProviderMutex, ensurePlaywright } from './playwright.ts';
import { getModelTelemetry, recordSuccess, recordFailure } from '../core/telemetry/telemetry.ts';
import { v4 as uuidv4 } from 'uuid';
import {
  makeChunk,
  TOOL_START,
  TOOL_END,
  findToolOpen,
  findPartialToolOpenIndex,
  parseToolCallBlock,
  extractToolName,
  inferToolNameFromParameters,
  coerceParameterValue
} from '../shared/utils/stream-utils.ts';

const sessionStates: Record<string, number | null> = (globalThis as any)._sessionStates || {};
(globalThis as any)._sessionStates = sessionStates;

export function updateSessionParent(sessionId: string, parentId: number | null) {
  if (sessionId) {
    sessionStates[sessionId] = parentId;
  }
}

export class DeepSeekProvider implements Provider {
  readonly id = 'deepseek';

  async init(): Promise<void> {
    await ensurePlaywright(this.id, true);
  }

  async close(): Promise<void> {
    // Cleanup handled by Playwright service if needed
  }

  private async getHeaders(forceNew = false): Promise<{ headers: Record<string, string>, chatSessionId: string, parentMessageId: number | null }> {
    if (process.env.TEST_MOCK_PLAYWRIGHT) {
      return { headers: { authorization: 'Bearer MOCK' }, chatSessionId: 'mock-session', parentMessageId: null };
    }

    await this.init();
    const release = await getProviderMutex(this.id).acquire();
    try {
      const activePage = getActivePage(this.id);
      if (!activePage) throw new Error('Playwright not initialized for deepseek');

      const currentUrl = activePage.url();
      const isOnDeepSeek = currentUrl.includes('chat.deepseek.com');
      const isOnSpecificChat = isOnDeepSeek && /\/chat\/\d+/.test(currentUrl);

      if (!isOnDeepSeek || forceNew || isOnSpecificChat) {
        await activePage.goto('https://chat.deepseek.com/', { waitUntil: 'domcontentloaded' });
      }

      await activePage.waitForSelector('textarea', { timeout: 30000 }).catch(() => {
        throw new Error('Timeout waiting for chat input. Are you logged in?');
      });

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout waiting for PoW headers')), 30000);

        const routeHandler = async (route: any, request: any) => {
          clearTimeout(timeout);
          
          const reqHeaders = request.headers();
          let uiSessionId = '';
          let uiParentMessageId: number | null = null;

          const postData = request.postData();
          if (postData) {
            try {
              const payload = JSON.parse(postData);
              if (payload.chat_session_id) uiSessionId = payload.chat_session_id;
              if (payload.parent_message_id !== undefined) uiParentMessageId = payload.parent_message_id;
            } catch (e) {}
          }

          const extractedHeaders = {
            'x-ds-pow-response': reqHeaders['x-ds-pow-response'] || '',
            'x-hif-dliq': reqHeaders['x-hif-dliq'] || '',
            'x-hif-leim': reqHeaders['x-hif-leim'] || '',
            'authorization': reqHeaders['authorization'] || '',
            'cookie': reqHeaders['cookie'] || ''
          };

          await route.abort('aborted');
          await activePage.unroute('**/api/v0/chat/completion', routeHandler);

          resolve({ headers: extractedHeaders, chatSessionId: uiSessionId, parentMessageId: uiParentMessageId });
        };

        activePage.route('**/api/v0/chat/completion', routeHandler).then(() => {
          activePage.fill('textarea', 'a').then(() => {
            activePage.keyboard.press('Enter');
          });
        });
      });
    } finally {
      release();
    }
  }

  async handleChatCompletion(
    request: OpenAIRequest,
    finalPrompt: string,
    completionId: string,
    emit?: EmitChunk
  ): Promise<ParsedCompletion> {
    const isProModel = request.model.includes('pro');
    const enableThinking = request.model.includes('thinking') || isProModel;
    
    const { headers, chatSessionId, parentMessageId } = await this.getHeaders(request.messages.length <= 2);

    const payload = {
      chat_session_id: chatSessionId || undefined,
      parent_message_id: null,
      model_type: isProModel ? 'expert' : null,
      prompt: finalPrompt,
      ref_file_ids: [],
      thinking_enabled: enableThinking,
      search_enabled: true,
      preempt: false
    };

    const response = await fetch('https://chat.deepseek.com/api/v0/chat/completion', {
      method: 'POST',
      headers: {
        'accept': '*/*',
        'accept-language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'authorization': headers['authorization'],
        'content-type': 'application/json',
        'origin': 'https://chat.deepseek.com',
        'x-ds-pow-response': headers['x-ds-pow-response'],
        'x-hif-dliq': headers['x-hif-dliq'],
        'x-hif-leim': headers['x-hif-leim'],
        'x-app-version': '2.0.0',
        'x-client-locale': 'pt_BR',
        'x-client-platform': 'web',
        'x-client-version': '2.0.0'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok || !response.body) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Failed to fetch from DeepSeek: ${response.status} ${response.statusText} - ${errText}`);
    }

    // Parse the stream
    const promptTokens = Math.ceil(finalPrompt.length / 3.5);
    return this.parseStreamToOpenAI(response.body, completionId, request.model, chatSessionId, request.tools || [], promptTokens, emit);
  }

  private async parseStreamToOpenAI(
    stream: ReadableStream,
    completionId: string,
    model: string,
    uiSessionId: string,
    tools: any[],
    promptTokens: number,
    emit?: EmitChunk
  ): Promise<ParsedCompletion> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();

    let currentAppendPath = '';
    let currentFragmentType = '';
    let reasoningContent = '';
    let content = '';
    let contentEmitBuffer = '';
    let insideTool = false;
    let currentToolOpenTag = TOOL_START;
    let emittedToolCallCount = 0;
    let completionTokens = 0;
    const toolCalls: ToolCall[] = [];
    let buffer = '';
    let pendingToolLeadIn = '';

    const emitContent = async (text: string) => {
      if (!text || emittedToolCallCount > 0) return;
      content += text;
      if (emit) await emit(makeChunk(completionId, model, { content: text }));
    };

    const parseRecoverableToolCallBlock = (block: string, openTag: string): any => {
      try {
        return parseToolCallBlock(block, openTag, tools);
      } catch {}
  
      const args: Record<string, unknown> = {};
      const closedParameterRe = /<parameter\b[^>]*\bname\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/parameter>/gi;
      let match: RegExpExecArray | null;
      let lastClosedEnd = 0;
      while ((match = closedParameterRe.exec(block)) !== null) {
        args[match[1]] = coerceParameterValue(match[2]);
        lastClosedEnd = closedParameterRe.lastIndex;
      }
  
      const tail = block.substring(lastClosedEnd);
      const unclosedParameterMatch = tail.match(/<parameter\b[^>]*\bname\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*)$/i);
      if (unclosedParameterMatch) {
        args[unclosedParameterMatch[1]] = coerceParameterValue(unclosedParameterMatch[2]);
      }
  
      if (Object.keys(args).length === 0) throw new Error('Unrecoverable tool call');
      const toolName = extractToolName(openTag, block) || inferToolNameFromParameters(args, tools);
      if (!toolName) throw new Error('Recoverable tool call missing name');
      return { name: toolName, arguments: args };
    };

    const emitToolCallFromBlock = async (toolBlock: string, openTag: string) => {
      try {
        const toolCallObj = parseRecoverableToolCallBlock(toolBlock, openTag);
        const toolName = toolCallObj.name || '';

        let toolArgs: Record<string, unknown> = {};
        if (toolCallObj.arguments && typeof toolCallObj.arguments === 'object') {
          toolArgs = toolCallObj.arguments;
        } else {
          const keys = Object.keys(toolCallObj).filter(k => k !== 'name');
          for (const k of keys) toolArgs[k] = toolCallObj[k];
        }

        if (!toolName) throw new Error('Tool call missing name');

        const toolId = 'call_' + uuidv4();
        const toolCall: ToolCall = {
          index: emittedToolCallCount,
          id: toolId,
          type: 'function',
          function: { name: toolName, arguments: JSON.stringify(toolArgs) }
        };
        toolCalls.push(toolCall);
        if (emit) await emit(makeChunk(completionId, model, { tool_calls: [toolCall] }));
        emittedToolCallCount++;
      } catch (e) {
        throw e;
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        const dataStr = trimmed.slice(6);
        if (dataStr === '[DONE]') continue;

        try {
          const chunk = JSON.parse(dataStr);
          let dsMessageId: any = null;
          if (chunk.response_message_id) {
            dsMessageId = chunk.response_message_id;
          } else if (chunk.v && typeof chunk.v === 'object') {
            if (chunk.v.response && chunk.v.response.message_id) {
              dsMessageId = chunk.v.response.message_id;
            } else if (chunk.v.message_id) {
              dsMessageId = chunk.v.message_id;
            }
          } else if (chunk.message_id) {
            dsMessageId = chunk.message_id;
          }

          if (dsMessageId) updateSessionParent(uiSessionId, dsMessageId);

          let vStr = '';
          let foundStr = false;
          let isThinkingChunk = false;

          if (typeof chunk.p === 'string') {
            currentAppendPath = chunk.p;
            if (chunk.p === 'response/accumulated_token_usage' && typeof chunk.v === 'number') {
              completionTokens = chunk.v;
            }
          }

          if (typeof chunk.v === 'string') {
            vStr = chunk.v;
            foundStr = true;
          } else if (chunk.v && typeof chunk.v === 'object') {
            if (chunk.v.response && chunk.v.response.fragments && chunk.v.response.fragments.length > 0) {
              const frag = chunk.v.response.fragments[0];
              if (typeof frag.content === 'string') {
                vStr = frag.content;
                foundStr = true;
                currentAppendPath = frag.type === 'THINK' ? 'response/thinking_content' : 'response/content';
                currentFragmentType = frag.type || '';
              }
            } else if (Array.isArray(chunk.v) && chunk.v.length > 0) {
              const firstObj = chunk.v[0];
              if (typeof firstObj.content === 'string') {
                vStr = firstObj.content;
                foundStr = true;
                currentAppendPath = firstObj.type === 'THINK' ? 'response/thinking_content' : 'response/content';
                currentFragmentType = firstObj.type || '';
              }
            }
          }

          if (chunk.p === 'response/fragments' && Array.isArray(chunk.v)) {
            const lastFrag = chunk.v[chunk.v.length - 1];
            if (lastFrag && lastFrag.type) currentFragmentType = lastFrag.type;
          }

          if (currentAppendPath.includes('thinking_content') ||
              currentAppendPath.includes('THINK') ||
              (currentAppendPath.includes('fragments/-1/content') && currentFragmentType === 'THINK')) {
            isThinkingChunk = true;
          }

          if (!foundStr || vStr === '' || vStr === 'FINISHED') continue;

          if (isThinkingChunk) {
            reasoningContent += vStr;
            const delta: ChoiceDelta = { reasoning_content: vStr };
            if (emit) await emit(makeChunk(completionId, model, delta));
            continue;
          }

          contentEmitBuffer += vStr;

          while (contentEmitBuffer.length > 0) {
            if (!insideTool) {
              const toolOpen = findToolOpen(contentEmitBuffer);
              if (toolOpen) {
                pendingToolLeadIn += contentEmitBuffer.substring(0, toolOpen.startIdx);
                insideTool = true;
                currentToolOpenTag = toolOpen.openTag;
                contentEmitBuffer = contentEmitBuffer.substring(toolOpen.endIdx);
                continue;
              }

              const partialStartIdx = findPartialToolOpenIndex(contentEmitBuffer);
              const flushIndex = partialStartIdx === -1 ? contentEmitBuffer.length : partialStartIdx;

              const textToEmit = contentEmitBuffer.substring(0, flushIndex);
              await emitContent(textToEmit);
              contentEmitBuffer = contentEmitBuffer.substring(flushIndex);
              break;
            }

            const lowerBuffer = contentEmitBuffer.toLowerCase();
            const endIdx = lowerBuffer.indexOf(TOOL_END);
            if (endIdx === -1) break;

            const toolBlock = contentEmitBuffer.substring(0, endIdx).trim();
            try {
              await emitToolCallFromBlock(toolBlock, currentToolOpenTag);
              pendingToolLeadIn = '';
            } catch (e) {
              if (emittedToolCallCount === 0 && pendingToolLeadIn.trim().length > 0) {
                await emitContent(pendingToolLeadIn);
              }
              pendingToolLeadIn = '';
            }

            insideTool = false;
            currentToolOpenTag = TOOL_START;
            contentEmitBuffer = contentEmitBuffer.substring(endIdx + TOOL_END.length);
          }
        } catch (e) {}
      }
    }

    if (insideTool && contentEmitBuffer.trim().length > 0) {
      try {
        await emitToolCallFromBlock(contentEmitBuffer.trim(), currentToolOpenTag);
        pendingToolLeadIn = '';
      } catch (e) {
        if (emittedToolCallCount === 0 && pendingToolLeadIn.trim().length > 0) {
          await emitContent(pendingToolLeadIn);
        }
        pendingToolLeadIn = '';
      }
    }

    if (!insideTool && contentEmitBuffer.length > 0 && emittedToolCallCount === 0) {
      await emitContent(contentEmitBuffer);
    }

    const usage: Usage = {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
      prompt_tokens_details: { cached_tokens: 0 }
    };

    return {
      content,
      reasoningContent,
      toolCalls,
      finishReason: emittedToolCallCount > 0 ? 'tool_calls' : 'stop',
      usage
    };
  }
}
