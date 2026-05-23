import { initPlaywright, getActivePage, closePlaywright } from './src/services/playwright.ts';

async function main() {
  await initPlaywright('kimi', false);
  const page = getActivePage('kimi');
  
  if (page) {
    await page.goto('https://www.kimi.com/');
    console.log('Please type a message to Kimi in the browser.');
    
    page.on('request', req => {
      if (req.method() === 'POST' && req.url().includes('chat')) {
        console.log('-> Kimi POST Request URL:', req.url());
        const postData = req.postData();
        if (postData) {
            console.log('-> Kimi POST Data:', postData.substring(0, 200) + '...');
        }
      }
    });
    
    page.on('response', async res => {
      if (res.request().method() === 'POST' && res.url().includes('chat')) {
        const type = res.headers()['content-type'] || '';
        console.log('<- Kimi Response URL:', res.url(), 'Type:', type);
        if (type.includes('event-stream') || type.includes('application/grpc') || type.includes('json')) {
           try {
               const text = await res.text();
               console.log('<- Kimi Response Body:', text.substring(0, 300) + '...');
           } catch (e) {}
        }
      }
    });
  }

  process.on('SIGINT', async () => {
    await closePlaywright('kimi');
    process.exit(0);
  });
}

main();
