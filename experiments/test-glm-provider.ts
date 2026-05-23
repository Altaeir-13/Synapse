import { GLMProvider } from './src/services/providers/glm.ts';
import { initPlaywright, closePlaywright } from './src/services/playwright.ts';

async function main() {
  await initPlaywright('glm', false);
  const provider = new GLMProvider();
  
  try {
    console.log('Testing ChatGLM provider...');
    const res = await provider.handleChatCompletion(
      {
          model: 'glm-4',
          messages: [{ role: 'user', content: 'What is the capital of France? Answer in one word.' }]
      },
      'What is the capital of France? Answer in one word.',
      'test-id',
      async (chunk) => {
          process.stdout.write(chunk.choices[0].delta.content || '');
      }
    );
    
    console.log('\n\nFinal Parsed Result:');
    console.log(res.content);
  } catch (e) {
    console.error('Failed:', e);
  }

  await closePlaywright('glm');
}

main();
