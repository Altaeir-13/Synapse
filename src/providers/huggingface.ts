import { Provider, ParsedCompletion, EmitChunk } from './base.ts';
import { OpenAIRequest, ToolCall, ChoiceDelta, Usage } from '../shared/types/index.ts';
import { getActivePage, getProviderMutex, ensurePlaywright } from './playwright.ts';
import { v4 as uuidv4 } from 'uuid';
import { makeChunk } from '../shared/utils/stream-utils.ts';

export class HuggingFaceProvider implements Provider {
  readonly id = 'huggingface';

  async init(): Promise<void> {
    await ensurePlaywright(this.id, true);
  }

  async close(): Promise<void> {
  }

  private async getHeaders(): Promise<{ headers: Record<string, string>, cookies: string }> {
    await this.init();
    const release = await getProviderMutex(this.id).acquire();
    try {
      const activePage = getActivePage(this.id);
      if (!activePage) throw new Error('Playwright not initialized for huggingface');

      const currentUrl = activePage.url();
      if (!currentUrl.includes('huggingface.co/chat')) {
        await activePage.goto('https://huggingface.co/chat/', { waitUntil: 'domcontentloaded' });
      }

      // Wait for the app to load
      await activePage.waitForSelector('textarea').catch(() => {});

      const cookiesArr = await activePage.context().cookies();
      const cookies = cookiesArr.map(c => `${c.name}=${c.value}`).join('; ');

      // To interact with the API, HF Chat usually requires specific headers (like origin, referer) 
      // and occasionally an authorization header if logged in. We'll extract basic ones.
      const headers = {
        'accept': '*/*',
        'content-type': 'application/json',
        'origin': 'https://huggingface.co',
        'referer': 'https://huggingface.co/chat/',
        'cookie': cookies
      };

      return { headers, cookies };
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
    
    // 1. Get Headers
    const { headers } = await this.getHeaders();

    // Map openai model name to HuggingFace model name
    let hfModel = 'Qwen/Qwen2.5-72B-Instruct'; // Default
    if (request.model.toLowerCase().includes('llama')) hfModel = 'meta-llama/Llama-3.1-70B-Instruct';
    if (request.model.toLowerCase().includes('gemma')) hfModel = 'google/gemma-2-27b-it';
    if (request.model.toLowerCase().includes('mistral')) hfModel = 'mistralai/Mistral-Nemo-Instruct-2407';
    
    // 2. Create Conversation (HF Chat requires creating a conversation first)
    // Note: HF API can be volatile. This is a best-effort structural implementation.
    const createConvRes = await fetch('https://huggingface.co/chat/conversation', {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: hfModel })
    });
    
    if (!createConvRes.ok) {
      const errText = await createConvRes.text().catch(() => '');
      throw new Error(`Failed to create HF conversation: ${createConvRes.status} - ${errText}`);
    }
    
    const convData = await createConvRes.json();
    const convId = convData.conversationId;

    // 3. Send Message
    const response = await fetch(`https://huggingface.co/chat/conversation/${convId}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        inputs: finalPrompt,
        parameters: {
          temperature: request.temperature || 0.7,
          top_p: request.top_p || 0.95,
          return_full_text: false,
          max_new_tokens: request.max_tokens || 4096
        },
        stream: true,
        options: { use_cache: false }
      })
    });

    if (!response.ok || !response.body) {
      throw new Error(`Failed to fetch from HuggingFace: ${response.status}`);
    }

    return this.parseStreamToOpenAI(response.body, completionId, request.model, emit);
  }

  private async parseStreamToOpenAI(
    stream: ReadableStream,
    completionId: string,
    model: string,
    emit?: EmitChunk
  ): Promise<ParsedCompletion> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();

    let content = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;

        const dataStr = trimmed.slice(5).trim();
        if (dataStr === '[DONE]') continue;

        try {
          const chunk = JSON.parse(dataStr);
          // HF Chat typically sends { type: 'stream', token: ' hello' }
          if (chunk.type === 'stream' && chunk.token) {
             const text = chunk.token.replace(/^\u0000/, ''); // Remove leading nulls if any
             content += text;
             if (emit) await emit(makeChunk(completionId, model, { content: text }));
          }
        } catch (e) {}
      }
    }

    const usage: Usage = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      prompt_tokens_details: { cached_tokens: 0 }
    };

    return {
      content,
      reasoningContent: '',
      toolCalls: [],
      finishReason: 'stop',
      usage
    };
  }
}
