const fs = require('fs');

function replaceInFile(filePath, replacements) {
  let content = fs.readFileSync(filePath, 'utf-8');
  for (const [from, to] of replacements) {
    content = content.replace(new RegExp(from.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g'), to);
  }
  fs.writeFileSync(filePath, content, 'utf-8');
}

// 1. src/__tests__/advanced.test.ts
replaceInFile('src/__tests__/advanced.test.ts', [
  ["from './index.ts';", "from '../app.ts';"],
  ["from './utils/compression.ts';", "from '../shared/utils/compression.ts';"],
  ["from './services/telemetry.ts';", "from '../core/telemetry/telemetry.ts';"]
]);

// 2. src/__tests__/index.test.ts
replaceInFile('src/__tests__/index.test.ts', [
  ["from './index.ts';", "from '../app.ts';"],
  ["from './services/playwright.ts';", "from '../providers/playwright.ts';"]
]);

// 3. src/core/runtime/engine.ts
replaceInFile('src/core/runtime/engine.ts', [
  ["from '../types/openai.ts';", "from '../../shared/types/openai.ts';"],
  ["from '../tools/registry.ts';", "from '../../tools/registry.ts';"],
  ["from '../tools/schema.ts';", "from '../../tools/schema.ts';"]
]);

// 4. src/core/runtime/types.ts
replaceInFile('src/core/runtime/types.ts', [
  ["from '../types/openai.ts';", "from '../../shared/types/openai.ts';"]
]);

// 5. src/providers/deepseek.ts
replaceInFile('src/providers/deepseek.ts', [
  ["from '../telemetry.ts';", "from '../core/telemetry/telemetry.ts';"]
]);

// 6. src/shared/types/index.ts
replaceInFile('src/shared/types/index.ts', [
  ["from '../tools/types.ts';", "from '../../tools/types.ts';"]
]);

// 7. src/tools/executor.ts
replaceInFile('src/tools/executor.ts', [
  ["from '../utils/json.ts';", "from '../shared/utils/json.ts';"]
]);

console.log('Imports refactored round 2!');
