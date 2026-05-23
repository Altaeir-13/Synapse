import { Provider } from './base.ts';
import { DeepSeekProvider } from './deepseek.ts';
import { HuggingFaceProvider } from './huggingface.ts';
import { KimiProvider } from './kimi.ts';
import { GLMProvider } from './glm.ts';
import { MiMoProvider } from './mimo.ts';

const providers: Record<string, Provider> = {
  deepseek: new DeepSeekProvider(),
  huggingface: new HuggingFaceProvider(),
  kimi: new KimiProvider(),
  glm: new GLMProvider(),
  mimo: new MiMoProvider()
};

export function getProvider(id: string): Provider {
  const p = providers[id];
  if (!p) throw new Error(`Provider ${id} not found`);
  return p;
}

export function getProviderForModel(modelName: string): Provider {
  const lower = modelName.toLowerCase();
  
  if (lower.includes('deepseek')) return providers.deepseek;
  if (lower.includes('qwen') || lower.includes('llama') || lower.includes('gemma') || lower.includes('mistral')) return providers.huggingface;
  if (lower.includes('kimi') || lower.includes('moonshot')) return providers.kimi;
  if (lower.includes('glm')) return providers.glm;
  if (lower.includes('mimo')) return providers.mimo;
  
  // Default to huggingface for unknown open source models, or deepseek if preferred
  return providers.deepseek;
}

export function getAllProviders(): Provider[] {
  return Object.values(providers);
}
