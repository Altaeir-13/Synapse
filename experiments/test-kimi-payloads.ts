import fs from 'fs';
import path from 'path';

async function main() {
    const token = fs.readFileSync(path.join(process.cwd(), '.kimi-token'), 'utf-8').trim();
    
    const payloads = [
        { messages: [{role: 'user', content: 'oi'}], model: 'moonshot-v1-auto', useSearch: true },
        { messages: [{role: 'user', content: 'oi'}], model: 'kimi', use_search: true },
        { prompt: 'oi', model: 'moonshot-v1-auto' },
        { text: 'oi', model: 'moonshot-v1-auto' },
        { message: 'oi' },
        { messages: [{role: 'user', content: 'oi'}], refs: [], use_search: true },
        { messages: [{role: 'user', content: 'oi'}], new_chat: true },
        { messages: [{role: 'user', content: 'oi'}] },
    ];

    for (let i = 0; i < payloads.length; i++) {
        const res = await fetch('https://www.kimi.com/apiv2/kimi.gateway.chat.v1.ChatService/Chat', {
            method: 'POST',
            headers: {
                'accept': 'application/connect+json',
                'content-type': 'application/connect+json',
                'authorization': token,
            },
            body: JSON.stringify(payloads[i])
        });
        console.log(`Payload ${i}: Status ${res.status}`);
        const text = await res.text();
        console.log(text.substring(0, 100));
    }
}

main();
