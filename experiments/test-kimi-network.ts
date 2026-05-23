import { initPlaywright, getActivePage, closePlaywright } from './src/services/playwright.ts';
import fs from 'fs';

async function main() {
  await initPlaywright('kimi', true);
  const page = getActivePage('kimi');
  
  if (page) {
    const logs: string[] = [];
    page.on('request', req => logs.push(`REQ: ${req.method()} ${req.url()}`));
    page.on('response', async res => {
        logs.push(`RES: ${res.status()} ${res.url()}`);
        if (res.url().includes('token') || res.url().includes('auth') || res.url().includes('refresh')) {
            try {
                logs.push(`BODY: ${await res.text()}`);
            } catch(e){}
        }
    });
    
    await page.goto('https://www.kimi.com/', { waitUntil: 'networkidle' });
    // force a click on the chat box to trigger lazy loaded things
    try {
        await page.click('textarea');
        await page.waitForTimeout(2000);
    } catch(e) {}

    fs.writeFileSync('kimi-network.log', logs.join('\n'));
    console.log('Saved network log to kimi-network.log');
  }

  await closePlaywright('kimi');
}

main();
