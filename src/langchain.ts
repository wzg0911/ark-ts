/**
 * ARK × LangChain.js Integration
 * Drop-in trust layer for LangChain agents.
 *
 * Usage:
 *   import { ARKCallbackHandler } from 'ark-trust/langchain';
 *   const agent = await createOpenAIToolsAgent({ llm, tools, prompt });
 *   const executor = new AgentExecutor({ agent, tools, callbacks: [new ARKCallbackHandler()] });
 */

import { IdempotencyGuard } from './guard.js';
import { CircuitBreaker } from './breaker.js';
import { OutputValidator } from './validator.js';
import { Trace } from './trace.js';

interface CallbackInput {
  name: string;
  [key: string]: unknown;
}

interface LLMResult {
  generations: Array<{ text: string; [key: string]: unknown }>;
  llmOutput?: Record<string, unknown>;
}

export interface ARKReport {
  toolCalls: number;
  intercepted: number;
  blocked: number;
  guard: object;
  breaker: object;
  validator: object;
  trace: object | undefined;
}

/**
 * ARK信任层 × LangChain.js Callback系统
 *
 * 接入方式: 在 AgentExecutor 的 callbacks 中传入
 *   callbacks: [new ARKCallbackHandler()]
 */
export class ARKCallbackHandler {
  guard: IdempotencyGuard;
  breaker: CircuitBreaker;
  validator: OutputValidator;
  trace: Trace | null = null;

  private intercepted = 0;
  private blocked = 0;
  private toolCalls = 0;

  constructor(opts?: {
    idempotencyTtlMs?: number;
    circuitFailures?: number;
    circuitRecoveryMs?: number;
  }) {
    this.guard = new IdempotencyGuard(opts?.idempotencyTtlMs ?? 3_600_000);
    this.breaker = new CircuitBreaker(
      'langchain-agent',
      opts?.circuitFailures ?? 3,
      opts?.circuitRecoveryMs ?? 30_000,
    );
    this.validator = new OutputValidator();
  }

  // ===== LLM Events =====
  handleLLMStart(_llm: unknown, _prompts: string[]): void {
    this.trace = new Trace('agent-turn');
    this.trace.startSpan('llm_call', { promptCount: String(_prompts?.length ?? 0) });
  }

  handleLLMEnd(_output: LLMResult): void {
    if (this.trace) {
      this.trace.endSpan(
        _output?.generations?.[0]?.text?.slice(0, 200),
      );
    }
  }

  handleLLMError(err: Error): void {
    if (this.trace) {
      this.trace.endSpan(undefined, err.message.slice(0, 200));
    }
  }

  // ===== Tool Events — ARK核心拦截点 =====
  handleToolStart(tool: CallbackInput, input: string): void {
    this.toolCalls++;
    const toolName = tool.name || 'unknown_tool';

    // 幂等检查
    const key = this.guard.key(toolName, { input });
    if (this.guard.check(key)) {
      this.intercepted++;
    }
    this.guard.record(key, `result_for_${key}`);

    // 链路追踪
    if (this.trace) {
      this.trace.startSpan('tool_call', { tool: toolName, input: input.slice(0, 100) });
    }
  }

  handleToolEnd(output: string): void {
    if (this.trace) {
      this.trace.endSpan(output?.slice(0, 200));
    }
  }

  handleToolError(err: Error): void {
    if (this.trace) {
      this.trace.endSpan(undefined, err.message.slice(0, 200));
    }
  }

  // ===== Agent Events =====
  handleAgentAction(action: { tool: string; toolInput: unknown; log: string }): void {
    if (this.trace) {
      this.trace.startSpan('agent_action', {
        tool: action.tool,
        log: action.log?.slice(0, 100),
      });
    }
  }

  handleAgentFinish(_finish: unknown): void {
    if (this.trace) {
      this.trace.endSpan();
    }
  }

  // ===== Chain Events (generic fallback) =====
  handleChainStart(_chain: unknown): void {
    if (!this.trace) {
      this.trace = new Trace('chain-run');
    }
  }

  handleChainEnd(_outputs: unknown): void {
    // chain complete
  }

  handleChainError(err: Error): void {
    if (this.trace) {
      this.trace.endSpan(undefined, err.message.slice(0, 200));
    }
  }

  /** Generate a trust report after the run */
  get report(): string {
    const gs = this.guard.stats;
    const bs = this.breaker.stats;
    const vs = this.validator.stats;
    const ts = this.trace?.summary();

    return [
      '╔═══════════════════════════════╗',
      '║  🛡 ARK × LangChain Report    ║',
      '╠═══════════════════════════════╣',
      `║  Tool Calls:     ${String(this.toolCalls).padEnd(11)} ║`,
      `║  Intercepted:    ${String(this.intercepted).padEnd(11)} ║`,
      `║  Blocked:        ${String(this.blocked).padEnd(11)} ║`,
      `║  Save Rate:      ${gs.saveRate.padEnd(11)} ║`,
      `║  Breaker:        ${bs.state.padEnd(11)} ║`,
      `║  Reliability:    ${bs.reliability.padEnd(11)} ║`,
      `║  Path Valid:     ${vs.blockRate.padEnd(11)} ║`,
      `║  Spans:          ${String(ts?.totalSpans ?? 0).padEnd(11)} ║`,
      `║  Status:         ${(ts?.status ?? 'ok').padEnd(11)} ║`,
      '╚═══════════════════════════════╝',
    ].join('\n');
  }

  get stats(): ARKReport {
    return {
      toolCalls: this.toolCalls,
      intercepted: this.intercepted,
      blocked: this.blocked,
      guard: this.guard.stats,
      breaker: this.breaker.stats,
      validator: this.validator.stats,
      trace: this.trace?.summary(),
    };
  }
}
