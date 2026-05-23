import { initPlaywright, getActivePage, closePlaywright } from './src/services/playwright.ts';
import fs from 'fs';

async function main() {
  await initPlaywright('kimi', false);
  const page = getActivePage('kimi');
  
  if (page) {
    page.on('request', req => {
       if (req.url().includes('kimi.gateway')) {
           console.log('REQ:', req.method(), req.url());
           console.log('BODY:', req.postData());
       }
    });
    
    await page.goto('https://www.kimi.com/');
    await page.waitForTimeout(2000);
    
    try {
        await page.fill('textarea', 'oi');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(5000);
    } catch(e) {}

  }

  await closePlaywright('kimi');
}

main();
