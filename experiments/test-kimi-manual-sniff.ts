import { initPlaywright, getActivePage, closePlaywright } from './src/services/playwright.ts';
import fs from 'fs';

async function main() {
  await initPlaywright('kimi', false);
  const page = getActivePage('kimi');
  
  if (page) {
    page.on('request', req => {
       if (req.url().includes('ChatService/Chat')) {
           console.log('\n--- CHAT REQUEST ---');
           console.log('URL:', req.url());
           console.log('HEADERS:', JSON.stringify(req.headers()));
           console.log('BODY:', req.postData());
           console.log('--------------------\n');
       }
    });
    
    await page.goto('https://www.kimi.com/');
    console.log('Page loaded! Please type a message in the Kimi browser window and send it...');
    
    await page.waitForTimeout(30000);
  }

  await closePlaywright('kimi');
}

main();
