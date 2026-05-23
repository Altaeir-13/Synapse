import { initPlaywright, getActivePage, closePlaywright } from './src/services/playwright.ts';

async function main() {
  await initPlaywright('glm', false);
  const page = getActivePage('glm');
  
  if (page) {
    await page.goto('https://chatglm.cn/', { waitUntil: 'domcontentloaded' });
    
    page.route('**/assistant/stream', async route => {
        const req = route.request();
        await route.abort();
        
        const res = await fetch(req.url(), {
            method: req.method(),
            headers: await req.allHeaders(),
            body: req.postData()
        });
        
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (reader) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const obj = JSON.parse(line.substring(5).trim());
                        console.log('CHUNK JSON:', JSON.stringify(obj, null, 2));
                        if (obj.is_end) {
                            console.log('DONE!');
                            return;
                        }
                    } catch(e) {}
                }
            }
        }
    });
    
    await page.waitForTimeout(2000);
    
    try {
        await page.fill('textarea', 'Write a sentence about AI');
        await page.waitForTimeout(500);
        await page.keyboard.press('Enter');
    } catch (e) {}

    await page.waitForTimeout(10000);
  }

  await closePlaywright('glm');
}

main();
