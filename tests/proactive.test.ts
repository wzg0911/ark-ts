import { describe, it, expect } from 'vitest';
import { ProactiveGuard, ProactiveBlockError } from '../src/proactive.js';

describe('ProactiveGuard', () => {
  it('starts with no patterns', () => {
    const pg = new ProactiveGuard();
    expect(pg.stats.patternsLearned).toBe(0);
  });

  it('records failures and learns patterns', () => {
    const pg = new ProactiveGuard();
    pg.recordFailure('send_email', { to: 'bad@test' }, 'Connection refused');
    expect(pg.stats.patternsLearned).toBe(1);
  });

  it('predicts high risk for matched pattern', () => {
    const pg = new ProactiveGuard('test', 0.1);
    const args = { amount: 99999 };
    pg.recordFailure('payment', args, 'Amount too high');
    const risk = pg.predictRisk('payment', args);
    expect(risk).toBeGreaterThan(0.1);
  });

  it('shouldBlock returns true above threshold', () => {
    const pg = new ProactiveGuard('test', 0.1);
    const args = { key: 'problematic' };
    pg.recordFailure('tool_x', args, 'Error');
    pg.recordFailure('tool_x', args, 'Error');
    const [blocked] = pg.shouldBlock('tool_x', args);
    expect(blocked).toBe(true);
  });

  it('shouldBlock returns false for unknown calls', () => {
    const pg = new ProactiveGuard();
    const [blocked, risk] = pg.shouldBlock('new_tool', { x: 1 });
    expect(blocked).toBe(false);
    expect(risk).toBe(0);
  });

  it('recordSuccess adds to history', () => {
    const pg = new ProactiveGuard();
    pg.recordSuccess('ok_tool', { data: 'good' });
    expect(pg.stats.historySize).toBe(1);
  });

  it('accuracy starts at 100%', () => {
    const pg = new ProactiveGuard();
    expect(pg.stats.accuracy).toBe('100.0%');
  });

  it('riskReport shows top patterns', () => {
    const pg = new ProactiveGuard();
    // Same args → 1 pattern with failureCount=2
    pg.recordFailure('fragile_api', { id: '123' }, 'Timeout');
    pg.recordFailure('fragile_api', { id: '123' }, 'Timeout');
    const report = pg.riskReport;
    expect(report).toContain('fragile_api');
    expect(report).toContain('×2');
  });

  it('recordPredictionOutcome tracks accuracy', () => {
    const pg = new ProactiveGuard();
    pg.recordPredictionOutcome(true, false); // blocked
    pg.recordPredictionOutcome(false, true); // allowed + success
    const s = pg.stats;
    expect(s.blockedCalls).toBe(1);
    expect(s.allowedCalls).toBe(1);
  });

  it('ProactiveBlockError has correct properties', () => {
    const err = new ProactiveBlockError('test_tool', 0.85, 'High risk');
    expect(err.toolName).toBe('test_tool');
    expect(err.risk).toBeCloseTo(0.85);
    expect(err.message).toContain('85%');
  });

  it('trims history when exceeding limit', () => {
    const pg = new ProactiveGuard('test', 0.5, 10);
    for (let i = 0; i < 20; i++) {
      pg.recordSuccess('tool', { idx: i });
    }
    expect(pg.stats.historySize).toBe(10);
  });
});