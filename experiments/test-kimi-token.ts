import { initPlaywright, getActivePage, closePlaywright } from './src/services/playwright.ts';

async function main() {
  await initPlaywright('kimi', true);
  const page = getActivePage('kimi');
  
  if (page) {
    await page.goto('https://www.kimi.com/');
    
    const localStorageData = await page.evaluate(() => {
      return {
         tea: localStorage.getItem('__tea_cache_tokens_20001731'),
         tea_first: localStorage.getItem('__tea_cache_first_20001731'),
         all: JSON.stringify(localStorage)
      };
    });
    console.log('Tea Tokens:', localStorageData.tea);
  }

  await closePlaywright('kimi');
}

main();
