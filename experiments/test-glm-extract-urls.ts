import fs from 'fs';
const log = fs.readFileSync('C:/Users/handi/.gemini/antigravity-ide/brain/6abbce2d-8615-4a22-9eb0-7e4a3354919b/.system_generated/tasks/task-624.log', 'utf-8');
const urls = new Set<string>();
for (const line of log.split('\n')) {
  if (line.startsWith('URL: ')) {
      urls.add(line.substring(5).trim());
  }
}
console.log('Unique URLs:');
console.log(Array.from(urls).join('\n'));
