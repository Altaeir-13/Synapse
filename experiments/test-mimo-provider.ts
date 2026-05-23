import { MiMoProvider } from './src/services/providers/mimo.ts';
import { initPlaywright, closePlaywright } from './src/services/playwright.ts';

async function main() {
  await initPlaywright('mimo', false);
  const provider = new MiMoProvider();
  
  try {
    console.log('Testing MiMo provider...');
    const res = await provider.handleChatCompletion(
      {
          model: 'mimo-v2.5-pro',
          messages: [{ role: 'user', content: 'What is the capital of France? Answer in one word.' }]
      },
      'What is the capital of France? Answer in one word.',
      'test-id',
      async (chunk) => {
          if (chunk.choices[0].delta.reasoning_content) {
             process.stdout.write(chunk.choices[0].delta.reasoning_content);
          }
          if (chunk.choices[0].delta.content) {
             process.stdout.write(chunk.choices[0].delta.content);
          }
      }
    );
    
    console.log('\n\nFinal Parsed Result:');
    console.log(res.content);
  } catch (e) {
    console.error('Failed:', e);
  }

  await closePlaywright('mimo');
}

main();
