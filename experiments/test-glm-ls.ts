import { initPlaywright, getActivePage, closePlaywright } from './src/services/playwright.ts';
import fs from 'fs';

async function main() {
  await initPlaywright('glm', false);
  const page = getActivePage('glm');
  
  if (page) {
    await page.goto('https://chatglm.cn/', { waitUntil: 'domcontentloaded' });
    const ls = await page.evaluate(() => JSON.stringify(window.localStorage));
    console.log(ls);
  }

  await closePlaywright('glm');
}

main();
