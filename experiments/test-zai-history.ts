import { chromium } from 'playwright';
import path from 'path';

async function main() {
  const profilePath = path.resolve('glm_profile');
  const context = await chromium.launchPersistentContext(profilePath, {
    headless: true,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();
  
  await page.route('**/api/v2/chat/completions*', async (route) => {
      const req = route.request();
      const url = req.url();
      const headers = await req.allHeaders();
      const postDataStr = req.postData() || '';
      await route.abort();
      await context.close();
      
      const postData = JSON.parse(postDataStr);
      
      // Inject history
      postData.messages = [
          { role: 'user', content: 'What is 2+2?' },
          { role: 'assistant', content: '4' },
          { role: 'user', content: 'multiply that by 10' }
      ];
      // signature_prompt is 'multiply that by 10'
      
      console.log('Sending modified request to backend...');
      const res = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(postData)
      });
      console.log(`Status: ${res.status}`);
      
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (reader) {
          const { value } = await reader.read();
          console.log('First chunk:', decoder.decode(value));
      }
      process.exit(0);
  });

  await page.goto('https://chat.z.ai/', { waitUntil: 'domcontentloaded' });
  
  try {
      const textArea = page.locator('textarea').first();
      await textArea.waitFor({ state: 'visible', timeout: 15000 });
      await textArea.fill('multiply that by 10');
      await page.keyboard.press('Enter');
  } catch (e) {
      console.error(e);
  }
}

main().catch(console.error);
