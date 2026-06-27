# 🛡 ARK — Agent Reliability Kit (TypeScript)

> **Trust infrastructure for AI agents.** Now in TypeScript.
> Stripe-level idempotency × Sentinel circuit breakers × OpenTelemetry tracing × IDE-style validation.

[![Tests](https://img.shields.io/badge/tests-20/20-green)](https://github.com/wzg0911/ark-ts)
[![npm](https://img.shields.io/badge/npm-@feilunxitong/arkit-blue)](https://www.npmjs.com/package/@feilunxitong/arkit)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![ARK Trusted](https://wzg0911.github.io/ark/badges/arkit-badge.svg)](https://github.com/wzg0911/ark-ts)

```bash
npm install @feilunxitong/arkit
```

```typescript
import { IdempotencyGuard, CircuitBreaker, autoInit } from '@feilunxitong/arkit';

// 🛡 Never run duplicate tool calls
const guard = new IdempotencyGuard();
const safeCharge = guard.wrap('stripe.charge', (amount: number) => 
  stripe.charges.create({ amount })
);

// ⚡ Auto-fallback when APIs fail
const breaker = new CircuitBreaker('gpt4', 3);
const result = await breaker.call(
  () => gpt4.generate(prompt),
  () => claude.generate(prompt) // falls back automatically
);

// 🔧 Validate agent output
const { guard: g, breaker: b, validator: v, score: s } = autoInit();
// Zero config — auto-detects your agent framework
```

## What's Included

| Component | Size | Description |
|-----------|------|-------------|
| 🛡 IdempotencyGuard | 2.3KB | Prevents duplicate tool calls |
| ⚡ CircuitBreaker | 2.8KB | Auto-fallback on failure |
| 🔧 OutputValidator | 1.9KB | Validates agent output |
| 👁 Trace | 2.7KB | Full execution tracing |
| 🎮 ReliabilityScore | 3.4KB | Viral reliability badge |
| 🏆 Achievements | 2.9KB | Gamification system |
| 📦 SchemaRegistry | 4.2KB | 8 built-in tool schemas |
| 🖥 Dashboard | 3.3KB | Trust monitor dashboard |
| 🔍 Auto-detect | 1.4KB | Zero-config framework detection |

**25KB total** · 16/16 tests · Node.js 18+ / TypeScript 5.x

## Quick Demo

```typescript
import { autoInit, Dashboard, Achievements } from 'ark-trust';

const ark = autoInit();
const dash = new Dashboard(ark.guard, ark.breaker, ark.validator, ark.score, ark.achievements);

// Simulate agent runs
ark.score.recordRun({ success: true, intercepts: 2, toolCalls: 10 });
ark.score.recordRun({ success: true, toolCalls: 15 });

// Get your reliability badge to share
console.log(ark.score.badgeUrl);  // shields.io badge URL
console.log(dash.render());       // Trust dashboard
```

## Python SDK

Also available: [`pip install ark-trust`](https://github.com/wzg0911/ark) (Python 3.9+)

---

**Built with 🧬 gene recombination · MIT License**
