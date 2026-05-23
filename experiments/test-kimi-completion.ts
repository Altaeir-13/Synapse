import { getProviderForModel } from './src/services/providers/index.ts';
import { initPlaywright } from './src/services/playwright.ts';
import { OpenAIRequest } from './src/utils/types.ts';

async function main() {
  await initPlaywright('kimi', true);
  const provider = getProviderForModel('kimi');
  await provider.init();

  const req: OpenAIRequest = {
    model: 'kimi-chat',
    messages: [
      { role: 'user', content: 'hello kimi' }
    ]
  };

  console.log('Sending chat completion to kimi...');
  try {
      const result = await provider.handleChatCompletion(req, 'hello kimi', 'cmpl-123', async (chunk) => {
        console.log('--- CHUNK ---');
        console.log(JSON.stringify(chunk, null, 2));
      });
      console.log('\nFinal Result:');
      console.log(result);
  } catch (e) {
      console.error('Error:', e);
  }
}

main();
