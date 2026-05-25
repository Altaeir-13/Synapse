import { Provider, ParsedCompletion, EmitChunk } from './base.ts';
import { getActivePage, ensurePlaywright } from './playwright.ts';
import { v4 as uuidv4 } from 'uuid';
import { makeChunk } from '../shared/utils/stream-utils.ts';
import { OpenAIRequest, Usage, ToolCall } from '../shared/types/index.ts';
import fs from 'fs';
import path from 'path';

export class KimiProvider implements Provider {
  id = 'kimi';
  
  async init(): Promise<void> {
    // Playwright is managed globally, no explicit browser boot here to save resources unless requested.
  }

  async close(): Promise<void> {}

  private cachedHeaders: Record<string, string> | null = null;

  private async getHeaders() {
    if (this.cachedHeaders) return this.cachedHeaders;

    await ensurePlaywright(this.id, true);
    const page = getActivePage(this.id);
    if (!page) {
      throw new Error('Kimi browser not initialized. Run `npm run login:kimi` first.');
    }

    let token = '';
    try {
        token = fs.readFileSync(path.join(process.cwd(), '.kimi-token'), 'utf-8').trim();
    } catch (e: any) {
        throw new Error(`Kimi token error: ${e.message}. Please run \`npm run login:kimi\` and send a message.`);
    }

    const cookies = await page.context().cookies();
    const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    
    const cleanHeaders: Record<string, string> = {
        'accept': 'application/connect+json',
        'content-type': 'application/connect+json',
        'authorization': token,
        'cookie': cookieStr,
        'origin': 'https://www.kimi.com',
        'referer': 'https://www.kimi.com/',
        'user-agent': await page.evaluate(() => navigator.userAgent),
    };
    
    this.cachedHeaders = cleanHeaders;
    return cleanHeaders;
  }

  async handleChatCompletion(
    request: OpenAIRequest,
    finalPrompt: string,
    completionId: string,
    emit?: EmitChunk
  ): Promise<ParsedCompletion> {
    const headers = await this.getHeaders();

    const lastMessage = request.messages[request.messages.length - 1];
    const kimiPayload = {
        scenario: "SCENARIO_K2D5",
        tools: [ { type: "TOOL_TYPE_SEARCH", search: {} } ],
        message: {
            role: lastMessage.role,
            blocks: [{ message_id: "", text: { content: typeof lastMessage.content === 'string' ? lastMessage.content : JSON.stringify(lastMessage.content) } }],
            scenario: "SCENARIO_K2D5"
        },
        options: { thinking: false }
    };

    const payloadString = JSON.stringify(kimiPayload);
    const payloadBuffer = Buffer.from(payloadString, 'utf-8');
    const grpcHeader = Buffer.alloc(5);
    grpcHeader.writeUInt8(0, 0);
    grpcHeader.writeUInt32BE(payloadBuffer.length, 1);
    const body = Buffer.concat([grpcHeader, payloadBuffer]);

    const response = await fetch('https://www.kimi.com/apiv2/kimi.gateway.chat.v1.ChatService/Chat', {
      method: 'POST',
      headers,
      body
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Kimi API error: ${response.status} ${text}`);
    }

    if (!response.body) {
      throw new Error('Kimi returned empty body');
    }

    return this.parseConnectStream(response.body, completionId, request.model, emit);
  }

  private async parseConnectStream(
    stream: ReadableStream,
    completionId: string,
    model: string,
    emit?: EmitChunk
  ): Promise<ParsedCompletion> {
    const reader = stream.getReader();
    let fullContent = '';
    let isDone = false;
    
    // Connect-Web / gRPC-web streams have a 5-byte header per message
    // 1 byte flags, 4 bytes length
    let buffer = new Uint8Array(0);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      if (value) {
        const newBuffer = new Uint8Array(buffer.length + value.length);
        newBuffer.set(buffer);
        newBuffer.set(value, buffer.length);
        buffer = newBuffer;
      }

      while (buffer.length >= 5) {
        const flags = buffer[0];
        const length = (buffer[1] << 24) | (buffer[2] << 16) | (buffer[3] << 8) | buffer[4];

        if (buffer.length < 5 + length) {
          break; // wait for more data
        }

        const msgData = buffer.slice(5, 5 + length);
        buffer = buffer.slice(5 + length);

        const msgText = new TextDecoder().decode(msgData);
        let event: any;
        try {
          event = JSON.parse(msgText);
        } catch (e) {
          continue; // ignore parse error
        }
        
        if (event.error) {
          throw new Error(`Kimi returned stream error: ${event.error.code || JSON.stringify(event.error)}. Your token may be expired. Run npm run login:kimi`);
        }
        
        if (event.op === 'append' && event.block?.text?.content) {
           const delta = event.block.text.content;
           if (delta) {
             fullContent += delta;
             if (emit) await emit(makeChunk(completionId, model, { content: delta }));
           }
        } else if (event.op === 'set' && event.message?.content && !fullContent) {
           // Fallback in case it's a full string set and we didn't get appends
           const delta = event.message.content;
           fullContent += delta;
           if (emit) await emit(makeChunk(completionId, model, { content: delta }));
        }
      }
    }

    const usage: Usage = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0
    };

    return {
      content: fullContent,
      reasoningContent: '',
      toolCalls: [],
      finishReason: 'stop',
      usage
    };
  }
}
