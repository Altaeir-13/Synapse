import { Provider, ParsedCompletion, EmitChunk } from './base.ts';
import { getActivePage, ensurePlaywright } from './playwright.ts';
import { makeChunk } from '../shared/utils/stream-utils.ts';
import { OpenAIRequest, Usage } from '../shared/types/index.ts';

export class GLMProvider implements Provider {
  id = 'glm';
  private cachedHeaders: Record<string, string> | null = null;
  private refreshPromise: Promise<void> | null = null;

  async init(): Promise<void> {
  }

  async close(): Promise<void> {}

  private async captureZaiRequest(finalPrompt: string): Promise<{ url: string, headers: Record<string, string>, payload: any }> {
    await ensurePlaywright(this.id, true);
    const page = getActivePage(this.id);
    if (!page) {
        throw new Error('GLM browser not initialized. Run `npm run login:glm` first.');
    }

    if (!page.url().includes('chat.z.ai')) {
        await page.goto('https://chat.z.ai/', { waitUntil: 'domcontentloaded' });
    }

    return new Promise(async (resolve, reject) => {
        let resolved = false;
        const routeHandler = async (route: any) => {
            const req = route.request();
            if (req.method() === 'POST') {
                const url = req.url();
                const headers = await req.allHeaders();
                const postDataStr = req.postData() || '';
                await route.abort();
                page.unroute('**/api/v2/chat/completions*', routeHandler);
                
                if (!resolved) {
                    resolved = true;
                    resolve({
                        url,
                        headers,
                        payload: JSON.parse(postDataStr)
                    });
                }
            } else {
                await route.continue();
            }
        };
        
        await page.route('**/api/v2/chat/completions*', routeHandler);

        try {
            // Type into the textarea to trigger the frontend signature and captcha execution
            // chat.z.ai typically uses a textarea
            const textArea = page.locator('textarea').first();
            await textArea.waitFor({ state: 'visible', timeout: 15000 });
            await textArea.fill(finalPrompt);
            await page.keyboard.press('Enter');
        } catch (e) {
            if (!resolved) {
                page.unroute('**/api/v2/chat/completions*', routeHandler);
                reject(new Error('Failed to trigger Z.ai request: ' + (e as Error).message));
            }
        }
    });
  }

  async handleChatCompletion(
    request: OpenAIRequest,
    finalPrompt: string,
    completionId: string,
    emit?: EmitChunk
  ): Promise<ParsedCompletion> {
    
    // 1. Capture a fresh request structure for THIS prompt
    const { url, headers, payload } = await this.captureZaiRequest(finalPrompt);

    // Z.ai calculates a strict signature based on the payload.
    // We MUST NOT modify payload.messages or payload.model, as it invalidates the signature and causes 500 errors.
    // The finalPrompt already contains the fully serialized conversation history.

    // 3. Fire the request ourselves
    const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GLM API error: ${response.status} ${text}`);
    }

    if (!response.body) {
      throw new Error('GLM returned empty body');
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
    let reasoningContent = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                try {
                    const jsonStr = line.substring(5).trim();
                    if (!jsonStr || jsonStr === '[DONE]') {
                        if (jsonStr === '[DONE]') break;
                        continue;
                    }
                    const obj = JSON.parse(jsonStr);
                    
                    let deltaContent = '';
                    let isReasoning = false;
                    
                    if (obj.data && obj.data.delta_content) {
                        deltaContent = obj.data.delta_content;
                        if (obj.data.phase === 'thinking') {
                            isReasoning = true;
                        }
                    }
                    
                    if (deltaContent) {
                        if (isReasoning) {
                            reasoningContent += deltaContent;
                        } else {
                            fullContent += deltaContent;
                        }
                        if (emit) await emit(makeChunk(completionId, model, { content: isReasoning ? '' : deltaContent }));
                    }
                    
                    if (obj.data && obj.data.phase === 'done') {
                        break;
                    }
                } catch (e) {
                    // ignore parse error
                }
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
      reasoningContent: reasoningContent,
      toolCalls: [],
      finishReason: 'stop',
      usage
    };
  }
}
