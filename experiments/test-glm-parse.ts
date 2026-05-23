import fs from 'fs';
const html = fs.readFileSync('glm.html', 'utf-8');
const matches = html.match(/<[^>]+id="[^"]+"[^>]*>/g);
if (matches) {
   console.log(matches.filter(m => m.includes('input') || m.includes('chat') || m.includes('text')).slice(0, 50).join('\n'));
}
