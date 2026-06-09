/**
 * Dashboard — 信任仪表盘
 * Real-time trust monitoring for AI agents.
 */

import { IdempotencyGuard } from './guard.js';
import { CircuitBreaker } from './breaker.js';
import { OutputValidator } from './validator.js';
import { ReliabilityScore } from './score.js';
import { Achievements } from './achievements.js';

export interface TrustMonitor {
  guardPasses: number;
  guardIntercepts: number;
  guardSaveRate: string;
  breakerState: string;
  breakerReliability: string;
  validatorPassed: number;
  validatorBlocked: number;
  validatorBlockRate: string;
  score: number;
  grade: string;
}

export class Dashboard {
  private guard: IdempotencyGuard;
  private breaker: CircuitBreaker;
  private validator: OutputValidator;
  private score: ReliabilityScore;
  private achievements: Achievements;

  constructor(
    guard: IdempotencyGuard,
    breaker: CircuitBreaker,
    validator: OutputValidator,
    score: ReliabilityScore,
    achievements: Achievements,
  ) {
    this.guard = guard;
    this.breaker = breaker;
    this.validator = validator;
    this.score = score;
    this.achievements = achievements;
  }

  get trustMonitor(): TrustMonitor {
    const gs = this.guard.stats;
    const bs = this.breaker.stats;
    const vs = this.validator.stats;
    return {
      guardPasses: gs.passes,
      guardIntercepts: gs.intercepts,
      guardSaveRate: gs.saveRate,
      breakerState: bs.state,
      breakerReliability: bs.reliability,
      validatorPassed: vs.passed,
      validatorBlocked: vs.blocked,
      validatorBlockRate: vs.blockRate,
      score: this.score.score,
      grade: this.score.grade,
    };
  }

  /** Render a text dashboard */
  render(): string {
    const t = this.trustMonitor;
    const unlocked = this.achievements.unlocked;
    return `
╔══════════════════════════════════════════════════╗
║           🛡 ARK Trust Dashboard                  ║
╠══════════════════════════════════════════════════╣
║                                                  ║
║  🛡 Idempotency Guard                            ║
║     Passes: ${String(t.guardPasses).padEnd(5)} Intercepts: ${String(t.guardIntercepts).padEnd(5)}       ║
║     Save Rate: ${t.guardSaveRate.padEnd(10)}                       ║
║                                                  ║
║  ⚡ Circuit Breaker                               ║
║     State: ${t.breakerState.padEnd(10)} Reliability: ${t.breakerReliability.padEnd(10)}  ║
║                                                  ║
║  🔧 Output Validator                             ║
║     Passed: ${String(t.validatorPassed).padEnd(5)} Blocked: ${String(t.validatorBlocked).padEnd(5)}        ║
║     Block Rate: ${t.validatorBlockRate.padEnd(10)}                       ║
║                                                  ║
║  🎯 Reliability Score: ${String(t.score).padEnd(5)} ${t.grade.padEnd(6)}              ║
║                                                  ║
║  🏆 Achievements: ${String(unlocked.length).padEnd(2)}/8 unlocked                       ║
║     ${unlocked.map((a) => `${a.icon} ${a.name}`).join(' | ') || 'None yet'}${' '.repeat(Math.max(0, 30 - unlocked.map((a) => `${a.icon} ${a.name}`).join(' | ').length))}║
║                                                  ║
╚══════════════════════════════════════════════════╝`;
  }
}
