/**
 * ReliabilityScore — 可靠性评分引擎
 * Gene source: Gaming achievement systems
 * Viral badge + social sharing built-in.
 */

interface ScoreRecord {
  timestamp: number;
  score: number;
  grade: string;
  intercepts: number;
  blocks: number;
}

export class ReliabilityScore {
  totalRuns = 0;
  successfulRuns = 0;
  duplicateIntercepts = 0;
  outputBlocks = 0;
  circuitTrips = 0;
  totalToolCalls = 0;
  totalToolFailures = 0;
  history: ScoreRecord[] = [];

  get score(): number {
    if (this.totalRuns === 0) return 0;
    const base = (this.successfulRuns / this.totalRuns) * 100;
    const penalty = (this.duplicateIntercepts + this.outputBlocks) * 0.3;
    const failPenalty =
      (this.totalToolFailures / Math.max(this.totalToolCalls, 1)) * 15;
    return Math.max(0, Math.min(100, +(base - penalty - failPenalty).toFixed(1)));
  }

  get grade(): string {
    const s = this.score;
    if (s >= 97) return 'S+ 🏆';
    if (s >= 93) return 'S';
    if (s >= 85) return 'A+';
    if (s >= 80) return 'A';
    if (s >= 70) return 'B+';
    if (s >= 60) return 'B';
    if (s >= 50) return 'C';
    return 'D';
  }

  get badgeUrl(): string {
    const colors: Record<string, string> = {
      'S+ 🏆': 'FFD700', S: '00C853', 'A+': '4CAF50',
      A: '8BC34A', 'B+': 'FFC107', B: 'FF9800',
      C: 'FF5722', D: 'F44336',
    };
    const color = colors[this.grade] || '999';
    const label = this.grade.replace(/ /g, '_');
    return `https://img.shields.io/badge/ARK_Score-${this.score}%25_${label}-${color}?style=for-the-badge&logo=shield`;
  }

  get markdownBadge(): string {
    return `[![ARK Score](${this.badgeUrl})](https://github.com/wzg0911/ark)`;
  }

  get shareText(): string {
    const templates: Record<string, string> = {
      'S+ 🏆': `🔥 ${this.score}% reliability! ARK caught ${this.duplicateIntercepts} dupes. S+ tier agent! ${this.markdownBadge}`,
      S: `⚡ Agent reliability: ${this.score}% (S rank). ARK = trust for AI. ${this.markdownBadge}`,
      'A+': `📈 ${this.score}% (A+). Getting closer to perfect. ${this.markdownBadge}`,
    };
    return templates[this.grade] ||
      `🛡 Agent trust: ${this.score}%. ${this.duplicateIntercepts} safe intercepts. ${this.markdownBadge}`;
  }

  recordRun(opts: {
    success: boolean;
    intercepts?: number;
    blocks?: number;
    toolCalls?: number;
    toolFailures?: number;
    circuitTrips?: number;
  }): void {
    this.totalRuns++;
    if (opts.success) this.successfulRuns++;
    this.duplicateIntercepts += opts.intercepts ?? 0;
    this.outputBlocks += opts.blocks ?? 0;
    this.totalToolCalls += opts.toolCalls ?? 0;
    this.totalToolFailures += opts.toolFailures ?? 0;
    this.circuitTrips += opts.circuitTrips ?? 0;
    this.history.push({
      timestamp: Date.now(),
      score: this.score,
      grade: this.grade,
      intercepts: opts.intercepts ?? 0,
      blocks: opts.blocks ?? 0,
    });
  }

  get summary() {
    return {
      score: this.score,
      grade: this.grade,
      totalRuns: this.totalRuns,
      successRate: `${((this.successfulRuns / Math.max(this.totalRuns, 1)) * 100).toFixed(1)}%`,
      totalIntercepts: this.duplicateIntercepts,
      totalBlocks: this.outputBlocks,
      toolReliability: `${((1 - this.totalToolFailures / Math.max(this.totalToolCalls, 1)) * 100).toFixed(1)}%`,
      badge: this.markdownBadge,
      share: this.shareText,
    };
  }
}
