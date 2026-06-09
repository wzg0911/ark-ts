/**
 * Auto-detection + zero-config bootstrap
 */
import { IdempotencyGuard } from './guard.js';
import { CircuitBreaker } from './breaker.js';
import { OutputValidator } from './validator.js';
import { ReliabilityScore } from './score.js';
import { SchemaRegistry } from './schema-registry.js';

export function detectFrameworks(): string[] {
  const frameworks: string[] = [];
  const checks: [string, string][] = [
    ['langchain', 'LangChain'],
    ['openai', 'OpenAI SDK'],
    ['anthropic', 'Anthropic SDK'],
    ['@google/generative-ai', 'Gemini SDK'],
    ['llamaindex', 'LlamaIndex'],
  ];
  for (const [mod, name] of checks) {
    try {
      require.resolve(mod);
      frameworks.push(name);
    } catch { /* not installed */ }
  }
  return frameworks;
}

export interface ARKConfig {
  frameworks: string[];
  mode: 'standalone' | 'integrated';
  guard: IdempotencyGuard;
  breaker: CircuitBreaker;
  validator: OutputValidator;
  score: ReliabilityScore;
  registry: SchemaRegistry;
}

export function autoInit(): ARKConfig {
  const frameworks = detectFrameworks();
  return {
    frameworks,
    mode: frameworks.length > 0 ? 'integrated' : 'standalone',
    guard: new IdempotencyGuard(),
    breaker: new CircuitBreaker('auto-detect'),
    validator: new OutputValidator(),
    score: new ReliabilityScore(),
    registry: new SchemaRegistry(),
  };
}
