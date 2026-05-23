import { initPlaywright, getActivePage, closePlaywright } from './src/services/playwright.ts';

async function main() {
  await initPlaywright('glm', false);
  const page = getActivePage('glm');
  
  if (page) {
    await page.goto('https://chatglm.cn/', { waitUntil: 'domcontentloaded' });
    const cookies = await page.context().cookies();
    const token = cookies.find(c => c.name === 'chatglm_token')?.value;
    
    if (token) {
        console.log('Got token, testing fetch...');
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
            "messages":[{"role":"user","content":[{"type":"text","text":"oi"}]}]
        };
        
        const res = await fetch('https://chatglm.cn/chatglm/backend-api/assistant/stream', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(reqBody)
        });
        
        console.log('Status:', res.status);
        if (res.status === 200) {
            console.log('Success! Stream started.');
        } else {
            console.log('Failed:', await res.text());
        }
    }
  }

  await closePlaywright('glm');
}

main();
