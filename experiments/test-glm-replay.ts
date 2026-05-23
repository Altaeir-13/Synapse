import { initPlaywright, getActivePage, closePlaywright } from './src/services/playwright.ts';

async function main() {
  await initPlaywright('glm', false);
  const page = getActivePage('glm');
  
  if (page) {
    await page.goto('https://chatglm.cn/', { waitUntil: 'domcontentloaded' });
    
    let capturedHeaders: any = null;
    
    page.route('**/assistant/stream', async route => {
        const req = route.request();
        capturedHeaders = await req.allHeaders();
        await route.abort();
    });
    
    await page.waitForTimeout(2000);
    
    try {
        await page.fill('textarea', 'A short test');
        await page.waitForTimeout(500);
        await page.keyboard.press('Enter');
    } catch (e) {}

    // Wait for the route to capture headers
    await page.waitForTimeout(3000);
    
    if (capturedHeaders) {
        console.log('Got headers, trying to replay with DIFFERENT payload...');
        const reqBody = {
            "assistant_id":"65940acff94777010aa6b796",
            "conversation_id":"",
            "project_id":"",
            "chat_type":"user_chat",
            "meta_data":{
                "cogview":{"rm_label_watermark":false},
                "is_test":false,
                "input_question_type":"xxxx",
                "channel":"",
                "draft_id":"",
                "chat_mode":"zero",
                "is_networking":false,
                "quote_log_id":"",
                "platform":"pc"
            },
            "messages":[{"role":"user","content":[{"type":"text","text":"Different payload!"}]}]
        };
        
        const res = await fetch('https://chatglm.cn/chatglm/backend-api/assistant/stream', {
            method: 'POST',
            headers: capturedHeaders,
            body: JSON.stringify(reqBody)
        });
        
        console.log('Status:', res.status);
        console.log('Response:', await res.text());
    }
  }

  await closePlaywright('glm');
}

main();
