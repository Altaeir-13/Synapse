import { initPlaywright, getActivePage, closePlaywright } from './src/services/playwright.ts';

async function main() {
  await initPlaywright('kimi', true);
  const page = getActivePage('kimi');
  
  if (page) {
    await page.goto('https://www.kimi.com/');
    const sessionStorageData = await page.evaluate(() => JSON.stringify(sessionStorage));
    console.log('SessionStorage:', sessionStorageData);
  }

  await closePlaywright('kimi');
}

main();
