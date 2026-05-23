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
      console.log('--- URL ---');
      console.log(req.url());
      console.log('--- HEADERS ---');
      console.log(await req.allHeaders());
      console.log('--- POST DATA ---');
      console.log(req.postData());
      await route.abort();
      await context.close();
      process.exit(0);
  });

  console.log('Navigating to chat.z.ai...');
  await page.goto('https://chat.z.ai/', { waitUntil: 'domcontentloaded' });
  
  console.log('Waiting for textarea...');
  try {
      const textArea = page.locator('textarea').first();
      await textArea.waitFor({ state: 'visible', timeout: 15000 });
      await textArea.fill('ping');
      await page.keyboard.press('Enter');
      console.log('Pressed enter, waiting for interception...');
  } catch (e) {
      console.log('Textarea not found. Try sending message manually if headless was false.');
  }
}

main().catch(console.error);
