import { initPlaywright, getActivePage, closePlaywright } from './src/services/playwright.ts';

async function main() {
  await initPlaywright('glm', false);
  const page = getActivePage('glm');
  
  if (page) {
    await page.goto('https://chatglm.cn/', { waitUntil: 'domcontentloaded' });
    
    page.route('**/assistant/stream', async route => {
        console.log('Intercepted!');
        await route.abort();
    });
    
    await page.waitForTimeout(2000);
    
    console.log('Sending first...');
    await page.fill('textarea', 'First test');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);
    
    // check if it can send second
    console.log('Sending second...');
    await page.fill('textarea', 'Second test');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);
  }

  await closePlaywright('glm');
}

main();
