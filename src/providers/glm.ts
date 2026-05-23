import { Provider, ParsedCompletion, EmitChunk } from './base.ts';
import { getActivePage } from './playwright.ts';
import { makeChunk } from '../shared/utils/stream-utils.ts';
import { OpenAIRequest, Usage } from '../shared/types/index.ts';

export class GLMProvider implements Provider {
  id = 'glm';
  private cachedHeaders: Record<string, string> | null = null;
  private refreshPromise: Promise<void> | null = null;

  async init(): Promise<void> {
  }

  async close(): Promise<void> {}

  private async getFreshHeaders(): Promise<Record<string, string>> {
    if (this.refreshPromise) {
        await this.refreshPromise;
        return this.cachedHeaders!;
    }

    this.refreshPromise = (async () => {
        const page = getActivePage(this.id);
        if (!page) {
            throw new Error('GLM browser not initialized. Run `npm run login:glm` first.');
        }

        // Ensure we are on the page
        if (!page.url().includes('chatglm.cn')) {
            await page.goto('https://chatglm.cn/', { waitUntil: 'domcontentloaded' });
        }

        return new Promise<void>(async (resolve, reject) => {
            // Add a temporary route to intercept the request
            const routeHandler = async (route: any) => {
                const req = route.request();
                this.cachedHeaders = await req.allHeaders();
                await route.abort();
                page.unroute('**/assistant/stream', routeHandler);
                resolve();
            };
            
            await page.route('**/assistant/stream', routeHandler);

            try {
                // Find the textarea and type something to trigger a request
                // Wait for the textarea to be ready
                await page.waitForSelector('textarea', { state: 'visible', timeout: 10000 });
                await page.fill('textarea', 'ping');
                await page.keyboard.press('Enter');
            } catch (e) {
                page.unroute('**/assistant/stream', routeHandler);
                reject(new Error('Failed to trigger GLM request for headers: ' + (e as Error).message));
            }
        });
    })();

    try {
        await this.refreshPromise;
    } finally {
        this.refreshPromise = null;
    }
    
    if (!this.cachedHeaders) throw new Error('Failed to capture GLM headers');
    return this.cachedHeaders;
  }

  async handleChatCompletion(
    request: OpenAIRequest,
    finalPrompt: string,
    completionId: string,
    emit?: EmitChunk
  ): Promise<ParsedCompletion> {
    let headers = this.cachedHeaders;
    if (!headers) {
        headers = await this.getFreshHeaders();
    }

    const glmPayload = {
        assistant_id: "65940acff94777010aa6b796",
        conversation_id: "",
        project_id: "",
        chat_type: "user_chat",
        meta_data: {
            cogview: { rm_label_watermark: false },
            is_test: false,
            input_question_type: "xxxx",
            channel: "",
            draft_id: "",
            chat_mode: "zero",
            is_networking: false,
            quote_log_id: "",
            platform: "pc"
        },
        messages: request.messages.map(m => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: [{ type: "text", text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }]
        }))
    };

    let response = await fetch('https://chatglm.cn/chatglm/backend-api/assistant/stream', {
        method: 'POST',
        headers,
        body: JSON.stringify(glmPayload)
    });

    // If headers expired or signature invalid, refresh and retry once
    if (!response.ok) {
        headers = await this.getFreshHeaders();
        response = await fetch('https://chatglm.cn/chatglm/backend-api/assistant/stream', {
            method: 'POST',
            headers,
            body: JSON.stringify(glmPayload)
        });
    }

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
    let previousText = '';

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
                    if (!jsonStr) continue;
                    const obj = JSON.parse(jsonStr);
                    
                    if (obj.parts && obj.parts.length > 0) {
                        const contentArr = obj.parts[0].content;
                        if (contentArr && contentArr.length > 0) {
                            const textObj = contentArr.find((c: any) => c.type === 'text');
                            if (textObj && textObj.text) {
                                const newText = textObj.text;
                                if (newText.length > previousText.length) {
                                    const delta = newText.substring(previousText.length);
                                    fullContent += delta;
                                    if (emit) await emit(makeChunk(completionId, model, { content: delta }));
                                    previousText = newText;
                                }
                            }
                        }
                    }
                    
                    if (obj.status === 'finish') {
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
      reasoningContent: '',
      toolCalls: [],
      finishReason: 'stop',
      usage
    };
  }
}
