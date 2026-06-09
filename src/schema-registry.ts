/**
 * SchemaRegistry — 社区驱动的工具Schema库
 * Built-in Zod schemas for common agent tools.
 */
import { z, ZodSchema } from 'zod';
import { OutputValidator } from './validator.js';

type SchemaEntry = { name: string; schema: ZodSchema; description: string };

export class SchemaRegistry {
  private schemas: Map<string, SchemaEntry> = new Map();

  constructor() {
    this.registerBuiltins();
  }

  private registerBuiltins(): void {
    const builtins: SchemaEntry[] = [
      // Payment
      {
        name: 'stripe.charge',
        description: 'Stripe charge creation',
        schema: z.object({
          amount: z.number().positive(),
          currency: z.string().length(3).default('usd'),
          description: z.string().optional(),
          customer: z.string().optional(),
        }),
      },
      {
        name: 'stripe.refund',
        description: 'Stripe refund',
        schema: z.object({
          chargeId: z.string().min(5),
          amount: z.number().positive().optional(),
          reason: z.string().optional(),
        }),
      },
      // Email
      {
        name: 'email.send',
        description: 'Send an email',
        schema: z.object({
          to: z.string().email(),
          subject: z.string().min(1).max(998),
          body: z.string().min(1),
          cc: z.array(z.string().email()).optional(),
        }),
      },
      // GitHub
      {
        name: 'github.create_issue',
        description: 'Create a GitHub issue',
        schema: z.object({
          owner: z.string().min(1),
          repo: z.string().min(1),
          title: z.string().min(1).max(256),
          body: z.string().default(''),
          labels: z.array(z.string()).optional(),
        }),
      },
      // Database
      {
        name: 'db.query',
        description: 'Execute a SQL query',
        schema: z.object({
          query: z.string().min(1),
          params: z.record(z.string(), z.unknown()).optional(),
        }),
      },
      // HTTP
      {
        name: 'http.request',
        description: 'Make an HTTP request',
        schema: z.object({
          url: z.string().url(),
          method: z.string().default('GET'),
          headers: z.record(z.string(), z.string()).optional(),
          body: z.unknown().optional(),
        }),
      },
      // Slack
      {
        name: 'slack.message',
        description: 'Send a Slack message',
        schema: z.object({
          channel: z.string().min(1),
          text: z.string().min(1),
          threadTs: z.string().optional(),
        }),
      },
      // File
      {
        name: 'file.write',
        description: 'Write to a file',
        schema: z.object({
          path: z.string().min(1),
          content: z.string(),
          mode: z.string().default('w'),
        }),
      },
    ];

    for (const entry of builtins) {
      this.schemas.set(entry.name, entry);
    }
  }

  get available(): string[] {
    return [...this.schemas.keys()].sort();
  }

  get(name: string): ZodSchema | undefined {
    return this.schemas.get(name)?.schema;
  }

  register(name: string, schema: ZodSchema, description?: string): void {
    this.schemas.set(name, { name, schema, description: description || '' });
  }

  validate(name: string, output: unknown, validator?: OutputValidator): import('./validator.js').ValidationResult | null {
    const schema = this.get(name);
    if (!schema) return null;
    const v = validator || new OutputValidator();
    return v.validate(schema, output);
  }

  /** Export all schemas as JSON Schema */
  exportAll(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [name, entry] of this.schemas) {
      result[name] = zodToJsonSchema(entry.schema);
    }
    return result;
  }
}

/** Minimal Zod → JSON Schema converter */
function zodToJsonSchema(schema: ZodSchema): unknown {
  try {
    // zod v3.23+ has toJsonSchema
    if ('toJsonSchema' in schema && typeof (schema as any).toJsonSchema === 'function') {
      return (schema as any).toJsonSchema();
    }
  } catch {}
  // Fallback: return type info
  return { type: 'object', _note: 'Install zod-to-json-schema for full export' };
}
