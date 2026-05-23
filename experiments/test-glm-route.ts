import { initPlaywright, getActivePage, closePlaywright } from './src/services/playwright.ts';
import fs from 'fs';

async function main() {
  await initPlaywright('glm', false);
  const page = getActivePage('glm');
  
  if (page) {
    await page.goto('https://chatglm.cn/', { waitUntil: 'domcontentloaded' });
    
    page.route('**/assistant/stream', async route => {
        const req = route.request();
        console.log('Intercepted request!');
        console.log('Headers:', await req.allHeaders());
        console.log('Body:', req.postData());
        
        // Abort the request in the browser so it doesn't do anything
        await route.abort();
        
        // Make the request from Node.js
        const res = await fetch(req.url(), {
            method: req.method(),
            headers: await req.allHeaders(),
            body: req.postData()
        });
        
        console.log('Node fetch status:', res.status);
        
        // Read stream
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        while (reader) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            console.log('CHUNK:', chunk.substring(0, 50));
            if (chunk.includes('[DONE]')) break;
        }
    });
    
    await page.waitForTimeout(2000);
    
    // Type and send
    try {
        await page.fill('textarea', 'Write a short poem about the ocean');
        await page.waitForTimeout(500);
        await page.keyboard.press('Enter');
    } catch (e) { 
        console.log('textarea failed', e);
    }

    await page.waitForTimeout(10000);
  }

  await closePlaywright('glm');
}

main();
