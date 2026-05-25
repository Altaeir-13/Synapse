import { Context } from 'hono';
import { stream as honoStream } from 'hono/streaming';
import { v4 as uuidv4 } from 'uuid';
import { getProviderForModel } from '../../providers/index.ts';
import { getModelTelemetry, recordSuccess, recordFailure } from '../../core/telemetry/telemetry.ts';
import { OpenAIRequest } from '../../shared/types/index.ts';
import { serializeOpenAIMessages, appendToolInstructions, makeChunk } from '../../shared/utils/stream-utils.ts';
import { compressMessages } from '../../shared/utils/compression.ts';

export async function chatCompletions(c: Context) {
  try {
    const body: Partial<OpenAIRequest> = await c.req.json().catch(() => ({}));
    
    if (!body.model || !Array.isArray(body.messages)) {
      return c.json({ error: { message: 'Invalid request: "model" and "messages" array are required.' } }, 400);
    }
    
    const request = body as OpenAIRequest;
    const isStream = request.stream ?? false;
    const messages = request.messages || [];
    const completionId = 'chatcmpl-' + uuidv4();

    const provider = getProviderForModel(request.model);

    let attempt = 0;
    const maxAttempts = 3;
    let lastError: any = null;

    // Handle Non-Streaming
    if (!isStream) {
      while (attempt < maxAttempts) {
        attempt++;
        const telemetry = getModelTelemetry(request.model);
        const currentTargetLimit = telemetry.detectedLimit;
        
        const compressed = compressMessages(messages, currentTargetLimit, serializeOpenAIMessages);
        const serialized = serializeOpenAIMessages(compressed);
        const systemPrompt = appendToolInstructions(serialized.systemPrompt, request);
        const finalPrompt = systemPrompt ? `${systemPrompt}\n${serialized.prompt}` : serialized.prompt;
        const promptSize = finalPrompt.length;

        try {
          console.log(`[API:Chat] Attempt ${attempt}/${maxAttempts} (non-stream) via ${provider.id} for prompt length ${promptSize} chars.`);
          const parsedResult = await provider.handleChatCompletion(request, finalPrompt, completionId);
          
          if (!parsedResult || (parsedResult.content === '' && parsedResult.toolCalls.length === 0)) {
             console.warn(`[API:Chat] Attempt ${attempt} (non-stream) response was empty.`);
             recordFailure(request.model, promptSize);
             continue;
          }

          recordSuccess(request.model, promptSize);
          
          const message: any = {
            role: 'assistant',
            content: parsedResult.toolCalls.length > 0 ? null : parsedResult.content
          };
          if (parsedResult.reasoningContent) message.reasoning_content = parsedResult.reasoningContent;
          if (parsedResult.toolCalls.length > 0) message.tool_calls = parsedResult.toolCalls;

          return c.json({
            id: completionId,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: request.model,
            choices: [{
              index: 0,
              message,
              logprobs: null,
              finish_reason: parsedResult.finishReason
            }],
            usage: parsedResult.usage
          });
        } catch (err: any) {
          console.error(`[API:Chat] Attempt ${attempt} (non-stream) failed:`, err.message);
          lastError = err;
          recordFailure(request.model, promptSize);
          if (attempt >= maxAttempts) break;
          await new Promise(r => setTimeout(r, 1000));
        }
      }
      throw lastError || new Error("Failed to get a response after multiple attempts.");
    }

    // Handle Streaming
    return honoStream(c, async (streamWriter: any) => {
      c.header('Content-Type', 'text/event-stream');
      c.header('Cache-Control', 'no-cache');
      c.header('Connection', 'keep-alive');

      const writeEvent = async (data: any) => {
        await streamWriter.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      while (attempt < maxAttempts) {
        attempt++;
        const telemetry = getModelTelemetry(request.model);
        const currentTargetLimit = telemetry.detectedLimit;
        
        const compressed = compressMessages(messages, currentTargetLimit, serializeOpenAIMessages);
        const serialized = serializeOpenAIMessages(compressed);
        const systemPrompt = appendToolInstructions(serialized.systemPrompt, request);
        const finalPrompt = systemPrompt ? `${systemPrompt}\n${serialized.prompt}` : serialized.prompt;
        const promptSizeUsed = finalPrompt.length;

        try {
          console.log(`[API:Chat] Attempt ${attempt}/${maxAttempts} (stream) via ${provider.id} for prompt length ${promptSizeUsed} chars.`);
          
          await writeEvent(makeChunk(completionId, request.model, { role: 'assistant', content: '' }));

          const parsed = await provider.handleChatCompletion(request, finalPrompt, completionId, writeEvent);

          recordSuccess(request.model, promptSizeUsed);
          await writeEvent(makeChunk(completionId, request.model, {}, parsed.finishReason, parsed.usage));
          await streamWriter.write('data: [DONE]\n\n');
          return; // Stream succeeded
        } catch (err: any) {
          console.error(`[API:Chat] Attempt ${attempt} (stream) failed:`, err.message);
          lastError = err;
          recordFailure(request.model, promptSizeUsed);
          if (attempt >= maxAttempts) {
            await streamWriter.write(`data: ${JSON.stringify({ error: { message: err.message } })}\n\n`);
            await streamWriter.write('data: [DONE]\n\n');
            return;
          }
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    });
  } catch (err: any) {
    console.error('Error in chatCompletions:', err);
    return c.json({ error: { message: err.message || 'Internal Server Error' } }, 500);
  }
}
