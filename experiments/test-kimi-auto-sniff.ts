import { initPlaywright, getActivePage, closePlaywright } from './src/services/playwright.ts';
import fs from 'fs';

async function main() {
  await initPlaywright('kimi', false);
  const page = getActivePage('kimi');
  
  if (page) {
    const logs: string[] = [];
    page.on('request', req => {
       if (req.url().includes('ChatService/Chat')) {
           const str = `\n--- CHAT REQUEST ---\nURL: ${req.url()}\nBODY: ${req.postData()}\n--------------------\n`;
           fs.appendFileSync('kimi-chat.log', str);
           console.log('✅ CAPTURED!');
       }
    });
    
    await page.goto('https://www.kimi.com/', { waitUntil: 'networkidle' });
    
    // Try to click anywhere in the middle to focus, or press Tab until focused
    await page.mouse.click(500, 500);
    await page.waitForTimeout(1000);
    
    // Find the contenteditable div
    try {
        await page.click('[contenteditable="true"]');
        await page.waitForTimeout(500);
        await page.keyboard.type('oi');
        await page.waitForTimeout(500);
        await page.keyboard.press('Enter');
    } catch (e) { 
        console.log('contenteditable failed', e);
    }

    await page.waitForTimeout(5000);
  }

  await closePlaywright('kimi');
}

main();
