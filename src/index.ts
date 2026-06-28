/**
 * ARK — Agent Reliability Kit
 * Trust infrastructure for AI agents. TypeScript/Node.js edition.
 *
 * 基因重组:
 *   🏦 Stripe → IdempotencyGuard
 *   ⚡ Sentinel → CircuitBreaker
 *   👁 OpenTelemetry → Trace
 *   🔧 IDE → OutputValidator
 *   🎮 Gaming → ReliabilityScore + Achievements
 */

export { IdempotencyGuard } from './guard.js';
export { CircuitBreaker, CircuitOpenError } from './breaker.js';
export { OutputValidator, ValidationResult } from './validator.js';
export { Trace, Span } from './trace.js';
export { ReliabilityScore } from './score.js';
export { SchemaRegistry } from './schema-registry.js';
export { detectFrameworks, autoInit } from './auto.js';
export { Achievements, Achievement, definitions } from './achievements.js';
export { Dashboard, TrustMonitor } from './dashboard.js';

// v0.4.1 — New modules
export { StatefulBreaker } from './stateful-breaker.js';
export { ModulePipeline, ModuleBlockError, RateLimitModule, LoggingModule } from './module-kit.js';
export type { Module, ModuleResult } from './module-kit.js';
export { Benchmarks } from './benchmarks.js';
export { MultiAgentProtocol } from './multi-agent.js';
export { ProactiveGuard, ProactiveBlockError } from './proactive.js';
export { SchemaHub, validateSchema } from './schema-hub.js';

// F9 Error Compressor (12-Factor Agents Factor 9)
export {
  truncateError,
  errorToLLMContext,
  shouldRetry,
  retryDelay,
  NON_RETRYABLE_TYPES,
  ErrorContext,
  withRetry,
} from './errors.js';
export type { TruncatedError, ErrorRecord, ErrorContextDict, RetryOptions, PreviousAttempt } from './errors.js';
export type { SchemaMeta } from './schema-hub.js';
export { BUILTIN_SCHEMAS, BUILTIN_META, CATEGORIES } from './schema-hub.js';
