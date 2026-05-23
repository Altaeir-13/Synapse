import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  page.on('request', request => {
    if (request.method() === 'POST' && request.resourceType() === 'fetch') {
      console.log('GLM POST Request:', request.url());
    }
  });
  page.on('response', async response => {
    if (response.request().method() === 'POST' && response.headers()['content-type']?.includes('text/event-stream')) {
      console.log('GLM SSE Stream detected on:', response.url());
    }
  });

  console.log('Navigating to GLM...');
  await page.goto('https://chat.z.ai/', { waitUntil: 'networkidle' });
  console.log('Done.');
  await browser.close();
})();
