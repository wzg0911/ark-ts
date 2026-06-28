/**
 * ARK Error Compressor (TypeScript) — F9: 把错误压缩进上下文
 * 基因来源：12-Factor Agents (HumanLayer) Factor 9
 * 
 * 三核心能力：
 * 1. truncateError() — 截断错误到 500 字符
 * 2. errorToLLMContext() — 喂给 LLM 的格式
 * 3. shouldRetry() — 重试判断器
 * 
 * 设计：零依赖、零开销、可序列化、12-Factor 自检 F9 ✅
 */

import { createHash } from 'crypto';

// ━━━━━━━━━━ 1. 错误截断 ━━━━━━━━━━

export interface TruncatedError {
  type: string;
  message: string;
  stackTail: string[];
  rawHash: string;
}

export function truncateError(
  err: Error | unknown,
  maxMessageLength = 500,
  maxStackLines = 3
): TruncatedError {
  const e = err instanceof Error ? err : new Error(String(err));
  const fullMessage = e.message;
  const truncatedMessage =
    fullMessage.length > maxMessageLength
      ? fullMessage.slice(0, maxMessageLength) + '...'
      : fullMessage;

  const stack = (e.stack || '').split('\n');
  const nonEmpty = stack.filter((line) => line.trim());
  const stackTail = nonEmpty.slice(-maxStackLines);

  const rawHash = createHash('md5')
    .update(fullMessage)
    .digest('hex')
    .slice(0, 8);

  return {
    type: e.name || 'Error',
    message: truncatedMessage,
    stackTail,
    rawHash,
  };
}

// ━━━━━━━━━━ 2. 喂给 LLM 的格式 ━━━━━━━━━━

export interface PreviousAttempt {
  type: string;
  message: string;
}

export function errorToLLMContext(
  err: Error | unknown,
  toolName: string,
  attempt: number,
  previousAttempts?: PreviousAttempt[]
): string {
  const truncated = truncateError(err);
  const lines: string[] = [
    `[ERROR] Tool \`${toolName}\` failed (attempt ${attempt})`,
    `Type:    ${truncated.type}`,
    `Message: ${truncated.message}`,
  ];

  if (truncated.stackTail.length > 0) {
    lines.push('Stack (last lines):');
    truncated.stackTail.forEach((line) => {
      lines.push(`  ${line.trim()}`);
    });
  }

  if (attempt >= 2) {
    lines.push('');
    lines.push('💡 Hint: This is a repeat failure. Consider:');
    lines.push('  - Different tool / approach');
    lines.push('  - Different input parameters');
    lines.push('  - Check input format / types');
    if (attempt >= 3) {
      lines.push('  - Escalate to human if critical');
    }
  }

  if (previousAttempts && previousAttempts.length > 0) {
    lines.push('');
    lines.push(`Previous attempts (${previousAttempts.length}):`);
    previousAttempts.slice(-3).forEach((prev, i) => {
      const msg = prev.message.length > 200 ? prev.message.slice(0, 200) : prev.message;
      lines.push(`  ${i + 1}. [${prev.type}] ${msg}`);
    });
  }

  return lines.join('\n');
}

// ━━━━━━━━━━ 3. 重试判断器 ━━━━━━━━━━

export const NON_RETRYABLE_TYPES = new Set([
  'AuthenticationError',
  'PermissionError',
  'ValidationError',
  'NotImplementedError',
  'SyntaxError',
  'ImportError',
  'ModuleNotFoundError',
]);

export function shouldRetry(
  err: Error | unknown,
  attempt: number,
  maxAttempts = 3
): boolean {
  if (attempt >= maxAttempts) return false;
  const e = err as { name?: string; constructor?: { name?: string } };
  const typeName = e?.name || e?.constructor?.name || 'Error';
  if (NON_RETRYABLE_TYPES.has(typeName)) return false;
  return true;
}

export function retryDelay(
  attempt: number,
  baseDelay = 1.0,
  maxDelay = 30.0,
  backoffFactor = 2.0
): number {
  const delay = baseDelay * Math.pow(backoffFactor, attempt - 1);
  return Math.min(delay, maxDelay);
}

// ━━━━━━━━━━ 4. ErrorContext 累加器 ━━━━━━━━━━

export interface ErrorRecord {
  type: string;
  message: string;
  stackTail: string[];
  attempt: number;
  timestamp: number;
  retryable: boolean;
}

export interface ErrorContextDict {
  tool_name: string;
  max_attempts: number;
  records: ErrorRecord[];
  started_at: number;
  failure_count: number;
  should_escalate: boolean;
}

export class ErrorContext {
  toolName: string;
  maxAttempts: number;
  records: ErrorRecord[] = [];
  startedAt: number;

  constructor(toolName: string, maxAttempts = 3) {
    this.toolName = toolName;
    this.maxAttempts = maxAttempts;
    this.startedAt = Date.now();
  }

  recordFailure(err: Error | unknown, attempt: number): ErrorRecord {
    const truncated = truncateError(err);
    const record: ErrorRecord = {
      type: truncated.type,
      message: truncated.message,
      stackTail: truncated.stackTail,
      attempt,
      timestamp: Date.now(),
      retryable: shouldRetry(err, attempt, this.maxAttempts),
    };
    this.records.push(record);
    return record;
  }

  get failureCount(): number {
    return this.records.length;
  }

  get lastError(): ErrorRecord | undefined {
    return this.records[this.records.length - 1];
  }

  get shouldEscalate(): boolean {
    if (this.records.length === 0) return false;
    const last = this.records[this.records.length - 1];
    return !last.retryable || last.attempt >= this.maxAttempts;
  }

  toLLMContext(): string {
    if (this.records.length === 0) return '';

    const lines: string[] = [
      `[ERROR CONTEXT] Tool \`${this.toolName}\` has ${this.failureCount} failure(s)`,
      '',
    ];

    for (const rec of this.records) {
      lines.push(`[ERROR] Tool \`${this.toolName}\` failed (attempt ${rec.attempt})`);
      lines.push(`Type:    ${rec.type}`);
      lines.push(`Message: ${rec.message}`);
      if (rec.stackTail.length > 0) {
        lines.push('Stack (last lines):');
        rec.stackTail.forEach((s) => {
          if (s && s.trim()) lines.push(`  ${s.trim()}`);
        });
      }
      if (rec.attempt >= 2) {
        lines.push('');
        lines.push('💡 Hint: This is a repeat failure. Consider:');
        lines.push('  - Different tool / approach');
        lines.push('  - Different input parameters');
        lines.push('  - Check input format / types');
        if (rec.attempt >= 3) {
          lines.push('  - Escalate to human if critical');
        }
      }
      lines.push('');
    }

    if (this.shouldEscalate) {
      lines.push('🚨 ESCALATE TO HUMAN: This tool has failed too many times.');
    }

    return lines.join('\n');
  }

  toDict(): ErrorContextDict {
    return {
      tool_name: this.toolName,
      max_attempts: this.maxAttempts,
      records: this.records,
      started_at: this.startedAt,
      failure_count: this.failureCount,
      should_escalate: this.shouldEscalate,
    };
  }
}

// ━━━━━━━━━━ 5. withRetry 装饰器风格的包装函数 ━━━━━━━━━━

export interface RetryOptions {
  toolName?: string;
  maxAttempts?: number;
  fallback?: (...args: any[]) => any;
  onRetry?: (attempt: number, delay: number) => void;
}

export function withRetry<TArgs extends any[], TReturn>(
  fn: (...args: TArgs) => TReturn | Promise<TReturn>,
  options: RetryOptions = {}
): ((...args: TArgs) => Promise<TReturn>) & { errorContext: ErrorContext } {
  const {
    toolName = fn.name || 'anonymous',
    maxAttempts = 3,
    fallback,
    onRetry,
  } = options;

  const ctx = new ErrorContext(toolName, maxAttempts);

  const wrapper = async (...args: TArgs): Promise<TReturn> => {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await fn(...args);
        if (attempt > 1) {
          console.log(`[${toolName}] F9 RECOVERED on attempt ${attempt}`);
        }
        return result;
      } catch (e) {
        ctx.recordFailure(e, attempt);
        if (!shouldRetry(e, attempt, maxAttempts)) {
          console.error(
            `[${toolName}] F9 ESCALATE: ${(e as Error).name}: ${(e as Error).message.slice(0, 200)}`
          );
          if (fallback) {
            return fallback(...args);
          }
          if (attempt >= maxAttempts) {
            throw new Error(
              `[${toolName}] All ${maxAttempts} attempts failed. ` +
                `Last error: ${(e as Error).name}: ${(e as Error).message.slice(0, 200)}`
            );
          }
          throw e;
        }
        const delay = retryDelay(attempt);
        console.warn(
          `[${toolName}] F9 RETRY ${attempt}/${maxAttempts} after ${delay.toFixed(1)}s: ${(e as Error).name}`
        );
        if (onRetry) onRetry(attempt, delay);
        await new Promise((resolve) => setTimeout(resolve, delay * 1000));
      }
    }
    throw new Error(`[${toolName}] Unexpected: loop ended without return`);
  };

  (wrapper as any).errorContext = ctx;
  return wrapper as typeof wrapper & { errorContext: ErrorContext };
}
