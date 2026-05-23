import { initPlaywright, getActivePage, closePlaywright } from './src/services/playwright.ts';
import fs from 'fs';

async function main() {
  await initPlaywright('glm', false);
  const page = getActivePage('glm');
  
  if (page) {
    await page.goto('https://chatglm.cn/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(10000);
    const html = await page.content();
    fs.writeFileSync('glm.html', html);
  }

  await closePlaywright('glm');
}

main();
