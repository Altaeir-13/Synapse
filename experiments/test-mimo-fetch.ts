import { initPlaywright, getActivePage, closePlaywright } from './src/services/playwright.ts';
import { v4 as uuidv4 } from 'uuid';

async function main() {
  await initPlaywright('mimo', false);
  const page = getActivePage('mimo');
  
  if (page) {
    await page.goto('https://aistudio.xiaomimimo.com/', { waitUntil: 'domcontentloaded' });
    
    const cookies = await page.context().cookies();
    const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    const phCookie = cookies.find(c => c.name === 'xiaomichatbot_ph')?.value || '';
    
    console.log('Cookie:', cookieStr);
    
    const conversationId = uuidv4().replace(/-/g, '');
    const msgId = uuidv4().replace(/-/g, '');
    
    const headers = {
        'accept': 'text/event-stream',
        'content-type': 'application/json',
        'cookie': cookieStr,
        'origin': 'https://aistudio.xiaomimimo.com',
        'referer': 'https://aistudio.xiaomimimo.com/',
        'user-agent': await page.evaluate(() => navigator.userAgent)
    };
    
    const body = {
        msgId,
        conversationId,
        query: 'What is 2+2?',
        isEditedQuery: false,
        modelConfig: {
            enableThinking: false,
            webSearchStatus: 'disabled',
            model: 'mimo-v2.5-pro'
        },
        multiMedias: []
    };
    
    const url = `https://aistudio.xiaomimimo.com/open-apis/bot/chat?xiaomichatbot_ph=${encodeURIComponent(phCookie)}`;
    
    console.log('\nSending request to:', url);
    const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
    });
    
    console.log('Status:', res.status);
    
    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        console.log('CHUNK:', chunk);
    }
  }

  await closePlaywright('mimo');
}

main();
