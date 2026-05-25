import { BaseProvider, ParsedCompletion, EmitChunk } from './base.ts';
import { OpenAIRequest, ToolCall, ChoiceDelta, Usage } from '../shared/types/index.ts';
import { getActivePage, getProviderMutex, ensurePlaywright } from './playwright.ts';
import { v4 as uuidv4 } from 'uuid';
import { makeChunk } from '../shared/utils/stream-utils.ts';

export class HuggingFaceProvider extends BaseProvider {
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

      const userAgent = await activePage.evaluate(() => navigator.userAgent);
      
      // To interact with the API, HF Chat usually requires specific headers (like origin, referer) 
      // and occasionally an authorization header if logged in. We'll extract basic ones.
      const headers = {
        'accept': '*/*',
        'content-type': 'application/json',
        'origin': 'https://huggingface.co',
        'referer': 'https://huggingface.co/chat/',
        'cookie': cookies,
        'user-agent': userAgent
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
    if (request.model.toLowerCase().includes('mistral')) {
      // Mistral models were removed from HuggingFace Chat. Fallback to Cohere Command R.
      hfModel = 'CohereLabs/c4ai-command-r-08-2024';
    }
    
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
    
    const textData = await createConvRes.text();
    let convData;
    try {
      convData = JSON.parse(textData);
    } catch (e) {
      throw new Error(`HuggingFace API returned invalid JSON (possibly Cloudflare or Login page). Response starts with: ${textData.substring(0, 50)}...`);
    }
    const convId = convData.conversationId;

    // 2.5 Fetch conversation info to get rootMessageId
    const infoRes = await fetch(`https://huggingface.co/chat/api/v2/conversations/${convId}`, {
      headers: { ...headers, 'accept': '*/*' }
    });
    
    if (!infoRes.ok) {
      const errText = await infoRes.text().catch(() => '');
      throw new Error(`Failed to fetch HF conv info: ${infoRes.status} - ${errText}`);
    }
    
    const apiData = await infoRes.json();
    const rootMessageId = apiData?.json?.rootMessageId || uuidv4(); // fallback just in case

    let finalInputs = finalPrompt;
    if (hfModel.toLowerCase().includes('llama')) {
      // Append an instruction to stop Llama 3 from hallucinating HF internal tools
      const antiToolPrompt = "\n\n[CRITICAL SYSTEM INSTRUCTION: DO NOT use any internal tools like `hf_whoami`. DO NOT output JSON function calls. Answer the user's request directly.]";
      finalInputs += antiToolPrompt;
    }

    // 3. Send Message
    const formData = new FormData();
    formData.append('data', JSON.stringify({
      id: rootMessageId,
      inputs: finalInputs,
      is_retry: false,
      is_continue: false,
      web_search: false,
      tools: []
    }));

    const chatHeaders: Record<string, string> = { ...headers, 'referer': `https://huggingface.co/chat/conversation/${convId}` };
    delete chatHeaders['content-type']; // let FormData set multipart boundary

    const response = await fetch(`https://huggingface.co/chat/conversation/${convId}`, {
      method: 'POST',
      headers: chatHeaders,
      body: formData
    });

    if (!response.ok || !response.body) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Failed to fetch from HuggingFace: ${response.status} - ${errText}`);
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
        if (!trimmed) continue;

        let dataStr = trimmed;
        if (dataStr.startsWith('data:')) {
          dataStr = dataStr.slice(5).trim();
        }
        if (dataStr === '[DONE]') continue;

        let chunk: any;
        try {
          chunk = JSON.parse(dataStr);
        } catch (e) {
          console.log("RAW HF UNPARSEABLE:", dataStr);
          continue;
        }

        console.log("RAW HF CHUNK:", JSON.stringify(chunk).substring(0, 300));
        
        if (chunk.type === 'error' || (chunk.type === 'status' && chunk.status === 'error')) {
          const errMsg = `\n\n[HuggingFace API Error: ${chunk.message || JSON.stringify(chunk)}]`;
          content += errMsg;
          if (emit) await emit(makeChunk(completionId, model, { content: errMsg }));
          break;
        }

        // HF Chat typically sends { type: 'stream', token: ' hello' }
        if (chunk.type === 'stream' && chunk.token) {
           const text = chunk.token.replace(/\u0000/g, ''); // Remove all nulls
           if (text) {
             content += text;
             if (emit) await emit(makeChunk(completionId, model, { content: text }));
           }
        } else if (chunk.type === 'finalAnswer' && chunk.text && !content) {
           // Fallback if we didn't get stream tokens
           const text = chunk.text.replace(/\u0000/g, '');
           content += text;
           if (emit) await emit(makeChunk(completionId, model, { content: text }));
        }
      }

    }

    console.log('\n[HF Final Content]', content.substring(0, 500) + (content.length > 500 ? '...' : ''));

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
