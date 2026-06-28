/**
 * ProactiveGuard — 预测性失败检测
 * Gene source: memU（意图捕获，⭐13,813）
 * Predict potential failures before they happen by learning from patterns.
 */

interface FailurePattern {
  toolName: string;
  paramSignature: string;
  failureCount: number;
  lastSeen: number;
  errorSamples: string[];
}

interface CallRecord {
  timestamp: number;
  tool: string;
  argsSig: string;
  success: boolean;
  error?: string;
}

export class ProactiveBlockError extends Error {
  toolName: string;
  risk: number;

  constructor(toolName: string, risk: number, reason: string) {
    super(
      `ARK ProactiveGuard blocked [${toolName}]. Risk: ${(risk * 100).toFixed(0)}%. ${reason}`,
    );
    this.name = 'ProactiveBlockError';
    this.toolName = toolName;
    this.risk = risk;
  }
}

interface ProactiveGuardStats {
  name: string;
  sensitivity: number;
  patternsLearned: number;
  predictionsMade: number;
  blockedCalls: number;
  allowedCalls: number;
  accuracy: string;
  historySize: number;
  riskThreshold: number;
}

function simpleHash(s: string): string {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    const char = s.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

export class ProactiveGuard {
  name: string;
  sensitivity: number;
  historySize: number;

  private patterns: Map<string, FailurePattern> = new Map();
  private callHistory: CallRecord[] = [];
  private predictions = 0;
  private correctPredictions = 0;
  private falsePositives = 0;
  private blockedCalls = 0;
  private allowedCalls = 0;
  private totalPatterns = 0;

  constructor(
    name: string = 'proactive-guard',
    sensitivity: number = 0.3,
    historySize: number = 1000,
  ) {
    this.name = name;
    this.sensitivity = sensitivity;
    this.historySize = historySize;
  }

  recordFailure(
    toolName: string,
    args: Record<string, unknown>,
    error: string,
  ): void {
    const sig = JSON.stringify(args, Object.keys(args).sort());
    const key = `${toolName}::${simpleHash(sig).slice(0, 8)}`;

    if (!this.patterns.has(key)) {
      this.patterns.set(key, {
        toolName,
        paramSignature: sig,
        failureCount: 0,
        lastSeen: Date.now(),
        errorSamples: [],
      });
      this.totalPatterns++;
    }

    const pattern = this.patterns.get(key)!;
    pattern.failureCount++;
    pattern.lastSeen = Date.now();
    if (pattern.errorSamples.length < 5) {
      pattern.errorSamples.push(error.slice(0, 100));
    }

    this.callHistory.push({
      timestamp: Date.now(),
      tool: toolName,
      argsSig: sig.slice(0, 20),
      success: false,
      error: error.slice(0, 50),
    });
    this.trimHistory();
  }

  recordSuccess(
    toolName: string,
    args: Record<string, unknown>,
  ): void {
    const sig = JSON.stringify(args, Object.keys(args).sort());
    this.callHistory.push({
      timestamp: Date.now(),
      tool: toolName,
      argsSig: sig.slice(0, 20),
      success: true,
    });
    this.trimHistory();
  }

  private trimHistory(): void {
    if (this.callHistory.length > this.historySize) {
      this.callHistory = this.callHistory.slice(-this.historySize);
    }
  }

  predictRisk(
    toolName: string,
    args: Record<string, unknown>,
  ): number {
    const sig = JSON.stringify(args, Object.keys(args).sort());
    const key = `${toolName}::${simpleHash(sig).slice(0, 8)}`;

    // 1. Exact pattern match
    if (this.patterns.has(key)) {
      const pattern = this.patterns.get(key)!;
      const recent = this.callHistory
        .slice(-20)
        .filter((c) => !c.success && c.tool === toolName)
        .length;
      const freq = pattern.failureCount / Math.max(this.callHistory.length, 1);
      const recency = 1 / (1 + (Date.now() - pattern.lastSeen) / 60_000);
      return Math.min(1, freq * 0.7 + recency * 0.3);
    }

    // 2. Tool-level risk
    const recentCalls = this.callHistory
      .slice(-50)
      .filter((c) => c.tool === toolName);
    if (recentCalls.length > 0) {
      const failRate =
        recentCalls.filter((c) => !c.success).length / recentCalls.length;
      return failRate * 0.5;
    }

    // 3. Unknown operation → conservative (0 for no history)
    if (this.callHistory.length === 0) return 0;

    // 4. Global trend
    const globalRecent = this.callHistory.slice(-50);
    const globalFailRate =
      globalRecent.filter((c) => !c.success).length /
      Math.max(globalRecent.length, 1);
    return globalFailRate * 0.3;
  }

  shouldBlock(
    toolName: string,
    args: Record<string, unknown>,
  ): [boolean, number, string] {
    const risk = this.predictRisk(toolName, args);

    if (risk >= this.sensitivity) {
      this.predictions++;
      const sig = JSON.stringify(args, Object.keys(args).sort());
      const key = `${toolName}::${simpleHash(sig).slice(0, 8)}`;
      let reason = `High risk (${(risk * 100).toFixed(0)}%). Previous failures detected.`;
      if (this.patterns.has(key)) {
        const samples = this.patterns.get(key)!.errorSamples;
        if (samples.length > 0) {
          reason += ` Example: ${samples[0]}`;
        }
      }
      return [true, risk, reason];
    }

    return [false, risk, ''];
  }

  recordPredictionOutcome(blocked: boolean, succeeded: boolean): void {
    if (blocked) {
      this.blockedCalls++;
      this.falsePositives++;
    } else {
      this.allowedCalls++;
      if (succeeded) this.correctPredictions++;
    }
  }

  get accuracy(): number {
    const total = this.correctPredictions + this.falsePositives;
    return total === 0 ? 1 : this.correctPredictions / total;
  }

  get stats(): ProactiveGuardStats {
    return {
      name: this.name,
      sensitivity: this.sensitivity,
      patternsLearned: this.totalPatterns,
      predictionsMade: this.predictions,
      blockedCalls: this.blockedCalls,
      allowedCalls: this.allowedCalls,
      accuracy: `${(this.accuracy * 100).toFixed(1)}%`,
      historySize: this.callHistory.length,
      riskThreshold: this.sensitivity,
    };
  }

  get riskReport(): string {
    const lines: string[] = [
      `🛡 ProactiveGuard: ${this.name}`,
      `   Patterns: ${this.totalPatterns} | Blocked: ${this.blockedCalls} | Acc: ${(this.accuracy * 100).toFixed(1)}%`,
    ];

    if (this.patterns.size > 0) {
      const sorted = [...this.patterns.values()]
        .sort((a, b) => b.failureCount - a.failureCount)
        .slice(0, 5);
      lines.push('   Top Risk Patterns:');
      for (const p of sorted) {
        const sample = p.errorSamples[0] ?? '';
        lines.push(`     ⚠ ${p.toolName} (×${p.failureCount}) ${sample.slice(0, 60)}`);
      }
    }

    return lines.join('\n');
  }
}