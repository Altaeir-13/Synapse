import { initPlaywright, getActivePage, closePlaywright } from './src/services/playwright.ts';

async function main() {
  await initPlaywright('glm', false);
  const page = getActivePage('glm');
  
  if (page) {
    await page.goto('https://chatglm.cn/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    
    // type a message
    await page.fill('textarea', 'Write a short poem about the ocean');
    await page.waitForTimeout(500);
    await page.keyboard.press('Enter');

    // poll for changes
    let lastText = '';
    for (let i = 0; i < 30; i++) {
        await page.waitForTimeout(1000);
        
        // Get all assistant messages. Zhipu's assistant responses might be inside a specific class.
        // Let's just find the last element that contains the text.
        // Or we can find elements by data attribute. ChatGLM usually has markdown containers.
        const texts = await page.evaluate(() => {
            const nodes = document.querySelectorAll('.markdown-body, .answer-text, .msg-content, .message-content, [class*="message"], [class*="answer"], [class*="content"]');
            return Array.from(nodes).map(n => (n as HTMLElement).innerText).filter(t => t.length > 0);
        });
        
        // The last long text is likely the answer.
        if (texts.length > 0) {
            const currentText = texts[texts.length - 1];
            if (currentText !== lastText) {
                console.log('Update:', currentText.substring(lastText.length));
                lastText = currentText;
            }
        }
    }
  }

  await closePlaywright('glm');
}

main();
