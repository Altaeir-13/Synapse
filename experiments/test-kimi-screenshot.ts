import { initPlaywright, getActivePage, closePlaywright } from './src/services/playwright.ts';

async function main() {
  await initPlaywright('kimi', true);
  const page = getActivePage('kimi');
  
  if (page) {
    await page.goto('https://www.kimi.com/', { waitUntil: 'networkidle' });
    await page.screenshot({ path: 'kimi-screenshot.png' });
    console.log('Saved screenshot to kimi-screenshot.png');
  }

  await closePlaywright('kimi');
}

main();
