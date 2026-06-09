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
