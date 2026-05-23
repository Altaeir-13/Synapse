import fs from 'fs';
const html = fs.readFileSync('glm.html', 'utf-8');
const start = html.indexOf('id="search-input-box"');
if (start !== -1) {
   const substr = html.substring(start, start + 4000);
   const matches = substr.match(/<[^>]+send[^>]+>/gi) || substr.match(/<[^>]+enter[^>]+>/gi) || substr.match(/<[^>]+class="[^"]*btn[^"]*"[^>]*>/gi);
   console.log(matches?.join('\n'));
}
