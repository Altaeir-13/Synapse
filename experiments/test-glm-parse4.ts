import fs from 'fs';
const html = fs.readFileSync('glm.html', 'utf-8');
const matches = html.match(/class="[^"]*msg[^"]*"/g) || html.match(/class="[^"]*message[^"]*"/g);
console.log(Array.from(new Set(matches)).join('\n'));
