import { initPlaywright, getActivePage, closePlaywright } from './src/services/playwright.ts';

async function main() {
  await initPlaywright('mimo', false);
  const page = getActivePage('mimo');
  
  if (page) {
    await page.goto('https://aistudio.xiaomimimo.com/', { waitUntil: 'domcontentloaded' });
    
    page.on('request', async req => {
        const url = req.url();
        // Log all requests that look like chat or stream, regardless of method to be safe
        if (url.includes('chat') || url.includes('stream') || url.includes('completion') || url.includes('message') || url.includes('api')) {
            if (req.method() === 'OPTIONS') return;
            console.log('\n[MIMO REQ]', req.method(), url);
            console.log('Headers:', await req.allHeaders());
            if (req.postData()) {
               console.log('Body:', req.postData()?.substring(0, 500));
            }
        }
    });
    
    console.log('Please log in and type a message in the MiMo interface. Waiting 300s...');
    await page.waitForTimeout(300000);
  }

  await closePlaywright('mimo');
}

main();
