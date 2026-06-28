/**
 * ModuleKit — 可组合可靠性模块
 * Gene source: GenericAgent（模块化能力魔方）+ nuwa-skill（认知蒸馏）
 * Stack minimal modules into composable reliability pipelines.
 */

export interface ModuleResult {
  action: 'allow' | 'block' | 'warn';
  reason: string;
  context: Record<string, unknown>;
}

export interface Module {
  name: string;
  enabled: boolean;
  priority: number;
  process(
    toolName: string,
    args: Record<string, unknown>,
    context: Record<string, unknown>,
  ): ModuleResult;
  stats: Record<string, unknown>;
}

export class ModuleBlockError extends Error {
  constructor(toolName: string, reason: string) {
    super(`ARK ModulePipe blocked [${toolName}]: ${reason}`);
    this.name = 'ModuleBlockError';
  }
}

interface PipelineStats {
  name: string;
  modules: number;
  totalCalls: number;
  blocked: number;
  allowed: number;
  blockRate: string;
  moduleList: string[];
}

export class ModulePipeline {
  name: string;
  modules: Module[] = [];
  private totalCalls = 0;
  private blockedCalls = 0;
  private allowedCalls = 0;

  constructor(name: string = 'default-pipeline') {
    this.name = name;
  }

  add(module: Module): this {
    this.modules.push(module);
    this.modules.sort((a, b) => a.priority - b.priority);
    return this;
  }

  remove(moduleName: string): boolean {
    const idx = this.modules.findIndex((m) => m.name === moduleName);
    if (idx >= 0) {
      this.modules.splice(idx, 1);
      return true;
    }
    return false;
  }

  process(
    toolName: string,
    args: Record<string, unknown>,
  ): ModuleResult {
    this.totalCalls++;
    let context: Record<string, unknown> = {};

    for (const module of this.modules) {
      if (!module.enabled) continue;
      const result = module.process(toolName, args, context);
      context = { ...context, ...(result.context ?? {}) };

      if (result.action === 'block') {
        this.blockedCalls++;
        return {
          action: 'block',
          reason: `[${module.name}] ${result.reason}`,
          context,
        };
      } else if (result.action === 'warn') {
        const warnings: string[] = (context.warnings as string[]) ?? [];
        warnings.push(result.reason);
        context.warnings = warnings;
      }
    }

    this.allowedCalls++;
    return { action: 'allow', reason: '', context };
  }

  wrap<T extends (...args: unknown[]) => unknown>(
    toolFunc: T,
    toolName?: string,
  ): (...args: Parameters<T>) => ReturnType<T> {
    const name = toolName ?? toolFunc.name;
    const pipeline = this;

    return function (this: unknown, ...args: Parameters<T>): ReturnType<T> {
      const argDict: Record<string, unknown> = {};
      for (let i = 0; i < args.length; i++) {
        argDict[`arg${i}`] = args[i];
      }

      const result = pipeline.process(name, argDict);
      if (result.action === 'block') {
        throw new ModuleBlockError(name, result.reason);
      }

      return toolFunc.apply(this, args) as ReturnType<T>;
    };
  }

  get stats(): PipelineStats {
    return {
      name: this.name,
      modules: this.modules.length,
      totalCalls: this.totalCalls,
      blocked: this.blockedCalls,
      allowed: this.allowedCalls,
      blockRate: `${((this.blockedCalls / Math.max(this.totalCalls, 1)) * 100).toFixed(1)}%`,
      moduleList: this.modules.map((m) => m.name),
    };
  }
}

// ─── Built-in Modules ───

export class RateLimitModule implements Module {
  name: string;
  enabled = true;
  priority = 100;
  maxCallsPerMinute: number;
  private callTimestamps: number[] = [];
  private blocked = 0;
  private passed = 0;

  constructor(maxCallsPerMinute: number = 60) {
    this.maxCallsPerMinute = maxCallsPerMinute;
    this.name = `rate-limit-${maxCallsPerMinute}pm`;
  }

  process(
    _toolName: string,
    _args: Record<string, unknown>,
    context: Record<string, unknown>,
  ): ModuleResult {
    const now = Date.now();
    this.callTimestamps = this.callTimestamps.filter(
      (t) => now - t < 60_000,
    );

    if (this.callTimestamps.length >= this.maxCallsPerMinute) {
      this.blocked++;
      return {
        action: 'block',
        reason: `Rate limit: ${this.maxCallsPerMinute}/min exceeded`,
        context,
      };
    }

    this.callTimestamps.push(now);
    this.passed++;
    return { action: 'allow', reason: '', context };
  }

  get stats(): Record<string, unknown> {
    return {
      name: this.name,
      enabled: this.enabled,
      limit: `${this.maxCallsPerMinute}/min`,
      blocked: this.blocked,
      passed: this.passed,
      activeInWindow: this.callTimestamps.length,
    };
  }
}

export class LoggingModule implements Module {
  name = 'logging';
  enabled = true;
  priority = 999;
  private log: Array<Record<string, unknown>> = [];
  maxLogSize = 1000;

  process(
    toolName: string,
    args: Record<string, unknown>,
    context: Record<string, unknown>,
  ): ModuleResult {
    this.log.push({
      timestamp: Date.now(),
      tool: toolName,
      argsKeys: Object.keys(args),
      warnings: (context.warnings as string[]) ?? [],
    });

    if (this.log.length > this.maxLogSize) {
      this.log = this.log.slice(-this.maxLogSize);
    }

    return { action: 'allow', reason: '', context };
  }

  get stats(): Record<string, unknown> {
    return {
      name: this.name,
      enabled: this.enabled,
      logSize: this.log.length,
    };
  }
}
