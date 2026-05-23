import { initPlaywright, getActivePage, closePlaywright } from './src/services/playwright.ts';
import fs from 'fs';

async function main() {
  await initPlaywright('glm', false);
  const page = getActivePage('glm');
  
  if (page) {
    page.on('request', req => {
       const url = req.url();
       if (url.includes('chat') && req.method() === 'POST') {
           console.log('\n--- POST REQUEST ---');
           console.log('URL:', url);
           console.log('HEADERS:', JSON.stringify(req.headers()));
           try { console.log('BODY:', req.postData()); } catch(e){}
           console.log('--------------------\n');
       }
    });
    
    await page.goto('https://chatglm.cn/', { waitUntil: 'domcontentloaded' });
    console.log('Page loaded! Please type a message and send it...');
    
    await page.waitForTimeout(40000);
  }

  await closePlaywright('glm');
}

main();
