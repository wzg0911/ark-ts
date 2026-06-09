/**
 * Trace — 链路追踪
 * Gene source: OpenTelemetry distributed tracing
 * Full execution trace visibility for agent runs.
 */
import * as crypto from 'crypto';

export interface Span {
  spanId: string;
  parentId?: string;
  name: string;
  start: number;
  end?: number;
  tags: Record<string, string>;
  result?: string;
  error?: string;
  children: Span[];
}

interface TraceSummary {
  traceId: string;
  totalSpans: number;
  durationMs: number;
  maxDepth: number;
  status: 'ok' | 'error';
}

export class Trace {
  traceId: string;
  spans: Span[] = [];
  private stack: Span[] = [];

  constructor(name: string) {
    this.traceId = crypto.randomUUID().slice(0, 8);
    this.startSpan(name);
  }

  startSpan(name: string, tags?: Record<string, string>): Span {
    const span: Span = {
      spanId: crypto.randomUUID().slice(0, 8),
      parentId: this.stack.length > 0 ? this.stack[this.stack.length - 1].spanId : undefined,
      name,
      start: Date.now(),
      tags: tags || {},
      children: [],
    };
    if (this.stack.length > 0) {
      this.stack[this.stack.length - 1].children.push(span);
    } else {
      this.spans.push(span);
    }
    this.stack.push(span);
    return span;
  }

  endSpan(result?: string, error?: string): void {
    const span = this.stack.pop();
    if (!span) return;
    span.end = Date.now();
    if (result) span.result = result.slice(0, 200);
    if (error) span.error = error.slice(0, 200);
  }

  /** Count all spans recursively */
  private countSpans(spans: Span[]): number {
    return spans.reduce((sum, s) => sum + 1 + this.countSpans(s.children), 0);
  }

  /** Max depth of span tree */
  private maxDepth(spans: Span[], depth = 1): number {
    return spans.reduce(
      (max, s) => Math.max(max, ...(s.children.length > 0 ? [this.maxDepth(s.children, depth + 1)] : [depth])),
      depth,
    );
  }

  summary(): TraceSummary {
    const totalSpans = this.countSpans(this.spans);
    const durationMs = this.spans.reduce((max, s) => {
      if (s.end) return Math.max(max, s.end - s.start);
      return max;
    }, 0);
    const hasError = this.spans.some((s) => s.error) ||
      this.spans.some((s) => s.children.some((c) => c.error));

    return {
      traceId: this.traceId,
      totalSpans,
      durationMs,
      maxDepth: this.maxDepth(this.spans),
      status: hasError ? 'error' : 'ok',
    };
  }

  /** Flatten spans into a list for table rendering */
  flatten(spans?: Span[], depth = 0): Array<Span & { depth: number }> {
    const list = spans || this.spans;
    return list.flatMap((s) => [
      { ...s, depth },
      ...this.flatten(s.children, depth + 1),
    ]);
  }
}
