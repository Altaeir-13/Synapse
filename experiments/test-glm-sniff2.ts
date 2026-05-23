import { initPlaywright, getActivePage, closePlaywright } from './src/services/playwright.ts';
import fs from 'fs';

async function main() {
  await initPlaywright('glm', false);
  const page = getActivePage('glm');
  
  if (page) {
    page.on('request', req => {
       if (req.method() === 'POST' && req.url().includes('chat')) {
           const str = `\n--- CHAT REQUEST ---\nURL: ${req.url()}\nHEADERS: ${JSON.stringify(req.headers())}\nBODY: ${req.postData()}\n--------------------\n`;
           fs.appendFileSync('glm-chat.log', str);
           console.log('✅ CAPTURED!');
       }
    });
    
    await page.goto('https://chatglm.cn/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    
    try {
        await page.fill('textarea', 'oi');
        await page.waitForTimeout(500);
        await page.keyboard.press('Enter');
    } catch (e) { 
        console.log('textarea failed', e);
    }

    await page.waitForTimeout(5000);
  }

  await closePlaywright('glm');
}

main();
