import fs from 'fs';
const html = fs.readFileSync('glm.html', 'utf-8');
const start = html.indexOf('id="search-input-box"');
if (start !== -1) {
   console.log(html.substring(start, start + 2000));
}
