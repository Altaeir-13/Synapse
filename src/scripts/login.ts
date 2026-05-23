import { initPlaywright, closePlaywright, getActivePage } from '../providers/playwright.ts';

import fs from 'fs';
import path from 'path';

async function main() {
  const providerId = process.argv[2] || 'deepseek';

  console.log(`Opening browser for provider: ${providerId}`);
  await initPlaywright(providerId, false); // false = not headless
  
  const activePage = getActivePage(providerId);
  if (activePage) {
    if (providerId === 'huggingface') {
      await activePage.goto('https://huggingface.co/chat/', { waitUntil: 'domcontentloaded' });
    } else if (providerId === 'kimi') {
      activePage.on('request', req => {
         const auth = req.headers()['authorization'];
         if (auth) {
             fs.writeFileSync(path.join(process.cwd(), '.kimi-token'), auth);
             console.log('✅ Kimi Authorization Token captured and saved!');
         }
      });
      await activePage.goto('https://www.kimi.com/', { waitUntil: 'domcontentloaded' });
    } else if (providerId === 'glm') {
      activePage.on('request', req => {
         if (req.method() === 'POST' || req.resourceType() === 'websocket') {
             console.log(`[Z.ai Network] ${req.method()} ${req.url()}`);
         }
      });
      await activePage.goto('https://chat.z.ai/', { waitUntil: 'domcontentloaded' });
    } else if (providerId === 'mimo') {
      await activePage.goto('https://aistudio.xiaomimimo.com/', { waitUntil: 'domcontentloaded' });
    } else {
      await activePage.goto('https://chat.deepseek.com/', { waitUntil: 'domcontentloaded' });
    }
  } else {
    console.error('Failed to get active page');
    process.exit(1);
  }

  console.log(`Browser opened for ${providerId}. Please complete any login steps if necessary.`);
  console.log('Once you are fully logged in and can see the chat interface, close the browser window or press Ctrl+C here.');
  
  // Wait indefinitely until user closes the process
  process.on('SIGINT', async () => {
    console.log('Closing browser...');
    await closePlaywright(providerId);
    process.exit(0);
  });
}

main();