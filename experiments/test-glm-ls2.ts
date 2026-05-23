import { initPlaywright, getActivePage, closePlaywright } from './src/services/playwright.ts';

async function main() {
  await initPlaywright('glm', false);
  const page = getActivePage('glm');
  
  if (page) {
    await page.goto('https://chatglm.cn/', { waitUntil: 'domcontentloaded' });
    const ls = await page.evaluate(() => Object.keys(window.localStorage));
    console.log(ls);
    
    // check if it has token
    const token = await page.evaluate(() => window.localStorage.getItem('chatglm_token') || window.localStorage.getItem('token') || window.localStorage.getItem('Authorization'));
    console.log('Token check 1:', token);
    
    // maybe cookies?
    const cookies = await page.context().cookies();
    console.log('Cookies:', cookies.map(c => c.name));
  }

  await closePlaywright('glm');
}

main();
