import { Provider, ParsedCompletion, EmitChunk } from './base.ts';
import { getActivePage } from './playwright.ts';
import { makeChunk } from '../shared/utils/stream-utils.ts';
import { OpenAIRequest, Usage } from '../shared/types/index.ts';
import { v4 as uuidv4 } from 'uuid';

export class MiMoProvider implements Provider {
  id = 'mimo';

  async init(): Promise<void> {}

  async close(): Promise<void> {}

  private async getFreshAuth() {
    const page = getActivePage(this.id);
    if (!page) {
        throw new Error('MiMo browser not initialized. Run `npm run login:mimo` first.');
    }

    if (!page.url().includes('aistudio.xiaomimimo.com')) {
        await page.goto('https://aistudio.xiaomimimo.com/', { waitUntil: 'domcontentloaded' });
    }

    const cookies = await page.context().cookies();
    const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    let phCookie = cookies.find(c => c.name === 'xiaomichatbot_ph')?.value || '';
    phCookie = phCookie.replace(/^"|"$/g, '');

    if (!phCookie) {
        throw new Error('Could not find xiaomichatbot_ph cookie. Are you logged in?');
    }

    const userAgent = await page.evaluate(() => navigator.userAgent).catch(() => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36');

    return { cookieStr, phCookie, userAgent };
  }

  async handleChatCompletion(
    request: OpenAIRequest,
    finalPrompt: string,
    completionId: string,
    emit?: EmitChunk
  ): Promise<ParsedCompletion> {
    let auth = await this.getFreshAuth();

    const conversationId = uuidv4().replace(/-/g, '');
    const msgId = uuidv4().replace(/-/g, '');

    // Format messages for MiMo: it usually expects a single query string for the current message,
    // but we can pass the last user message as query. 
    // Wait, how does it handle history? Let's just pass the finalPrompt for now, 
    // or we can pass a formatted prompt.
    // Since it's a new conversation each time, we pass finalPrompt as query.
    
    const payload = {
        msgId,
        conversationId,
        query: finalPrompt,
        isEditedQuery: false,
        modelConfig: {
            enableThinking: false,
            webSearchStatus: 'disabled',
            model: 'mimo-v2.5-pro'
        },
        multiMedias: []
    };

    const getFetchOptions = (currentAuth: any) => ({
        method: 'POST',
        headers: {
            'accept': 'text/event-stream',
            'content-type': 'application/json',
            'cookie': currentAuth.cookieStr,
            'origin': 'https://aistudio.xiaomimimo.com',
            'referer': 'https://aistudio.xiaomimimo.com/',
            'user-agent': currentAuth.userAgent
        },
        body: JSON.stringify(payload)
    });

    const url = `https://aistudio.xiaomimimo.com/open-apis/bot/chat?xiaomichatbot_ph=${encodeURIComponent(auth.phCookie)}`;
    let response = await fetch(url, getFetchOptions(auth));

    if (response.status === 401) {
        // Refresh auth and try again
        auth = await this.getFreshAuth();
        const newUrl = `https://aistudio.xiaomimimo.com/open-apis/bot/chat?xiaomichatbot_ph=${encodeURIComponent(auth.phCookie)}`;
        response = await fetch(newUrl, getFetchOptions(auth));
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`MiMo API error: ${response.status} ${text}`);
    }

    if (!response.body) {
      throw new Error('MiMo returned empty body');
    }

    return this.parseStream(response.body, completionId, request.model, emit);
  }

  private async parseStream(
    stream: ReadableStream,
    completionId: string,
    model: string,
    emit?: EmitChunk
  ): Promise<ParsedCompletion> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    
    let fullContent = '';
    let fullReasoning = '';
    let usage: Usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    
    let isReasoning = false;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        
        // The events come in format:
        // event:eventName\ndata:JSON\n\n

        // We can split by \n\n to get event blocks
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() || ''; // Keep the incomplete block in buffer
        
        for (const block of blocks) {
            const lines = block.split('\n');
            let eventType = '';
            let dataStr = '';
            
            for (const line of lines) {
                if (line.startsWith('event:')) {
                    eventType = line.substring(6).trim();
                } else if (line.startsWith('data:')) {
                    dataStr = line.substring(5).trim();
                }
            }

            if (eventType === 'message' && dataStr) {
                try {
                    const obj = JSON.parse(dataStr);
                    if (obj.type === 'text' && obj.content) {
                        let text = obj.content;
                        
                        // Parse reasoning tags from MiMo
                        // e.g. <think>\u0000reasoning</think>\u0000text
                        if (text.includes('<think>')) {
                            isReasoning = true;
                            text = text.replace('<think>', '');
                        }
                        
                        if (text.includes('</think>')) {
                            isReasoning = false;
                            const parts = text.split('</think>');
                            const rChunk = parts[0].replace(/\x00/g, '');
                            const tChunk = parts[1].replace(/\x00/g, '');
                            
                            fullReasoning += rChunk;
                            fullContent += tChunk;
                            
                            if (emit && rChunk) await emit(makeChunk(completionId, model, { content: '', reasoning_content: rChunk }));
                            if (emit && tChunk) await emit(makeChunk(completionId, model, { content: tChunk }));
                            continue;
                        }
                        
                        text = text.replace(/\x00/g, '');
                        
                        if (isReasoning) {
                            fullReasoning += text;
                            if (emit) await emit(makeChunk(completionId, model, { content: '', reasoning_content: text }));
                        } else {
                            fullContent += text;
                            if (emit) await emit(makeChunk(completionId, model, { content: text }));
                        }
                    }
                } catch (e) {
                    // ignore JSON parse errors for incomplete chunks
                }
            } else if (eventType === 'usage' && dataStr) {
                try {
                    const obj = JSON.parse(dataStr);
                    if (obj.promptTokens !== undefined) {
                        usage.prompt_tokens = obj.promptTokens;
                        usage.completion_tokens = obj.completionTokens;
                        usage.total_tokens = obj.totalTokens;
                    }
                } catch (e) {}
            } else if (eventType === 'finish') {
                // Stream finished
            }
        }
    }

    return {
      content: fullContent,
      reasoningContent: fullReasoning,
      toolCalls: [],
      finishReason: 'stop',
      usage
    };
  }
}
