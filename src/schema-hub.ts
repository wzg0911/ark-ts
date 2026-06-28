/**
 * SchemaHub — Community Schema Registry
 * v0.4.0: Community-driven schema ecosystem for agent tool validation.
 *
 * Philosophy:
 *   1. Low friction — one TypeScript interface = one schema
 *   2. Offline/online — local cache + remote hub
 *   3. Versioned — semantic versions for every schema
 *   4. Discoverable — search by category, tags, author
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ─── Schema Meta ───

export interface SchemaMeta {
  name: string;
  version: string;
  author: string;
  category: string;
  tags: string[];
  description: string;
  source: 'local' | 'remote';
  downloads: number;
  rating: number;
}

// ─── Categories ───

export const CATEGORIES: string[] = [
  'payment',
  'email',
  'github',
  'database',
  'http',
  'file',
  'messaging',
  'project',
  'ai',
  'security',
  'general',
];

// ─── Schema Validation Helpers ───

export interface ValidationError {
  field: string;
  message: string;
}

function validateField(
  field: string,
  value: unknown,
  rules: Record<string, unknown>,
): ValidationError | null {
  if (rules.required && (value === undefined || value === null)) {
    return { field, message: `${field} is required` };
  }
  if (value === undefined || value === null) return null;

  if (typeof rules.type === 'string') {
    const expectedType = rules.type as string;
    if (expectedType === 'string' && typeof value !== 'string') {
      return { field, message: `${field} must be a string` };
    }
    if (expectedType === 'number' && typeof value !== 'number') {
      return { field, message: `${field} must be a number` };
    }
    if (expectedType === 'boolean' && typeof value !== 'boolean') {
      return { field, message: `${field} must be a boolean` };
    }
    if (expectedType === 'array' && !Array.isArray(value)) {
      return { field, message: `${field} must be an array` };
    }
    if (expectedType === 'object' && (typeof value !== 'object' || value === null || Array.isArray(value))) {
      return { field, message: `${field} must be an object` };
    }
  }

  if (rules.pattern && typeof value === 'string') {
    const regex = new RegExp(rules.pattern as string);
    if (!regex.test(value)) {
      return { field, message: `${field} must match pattern ${rules.pattern}` };
    }
  }

  if (typeof rules.minLength === 'number' && typeof value === 'string' && value.length < rules.minLength) {
    return { field, message: `${field} must be at least ${rules.minLength} characters` };
  }

  if (typeof rules.maxLength === 'number' && typeof value === 'string' && value.length > rules.maxLength) {
    return { field, message: `${field} must be at most ${rules.maxLength} characters` };
  }

  if (typeof rules.gt === 'number' && typeof value === 'number' && value <= rules.gt) {
    return { field, message: `${field} must be greater than ${rules.gt}` };
  }

  if (typeof rules.minItems === 'number' && Array.isArray(value) && value.length < rules.minItems) {
    return { field, message: `${field} must have at least ${rules.minItems} items` };
  }

  if (typeof rules.minLength === 'number' && Array.isArray(value) && value.length < rules.minLength) {
    return { field, message: `${field} must have at least ${rules.minLength} items` };
  }

  return null;
}

export function validateSchema(
  schemaName: string,
  data: unknown,
): { valid: boolean; errors: ValidationError[] } {
  const schemaDef = BUILTIN_SCHEMAS[schemaName];
  if (!schemaDef) {
    return { valid: false, errors: [{ field: '_schema', message: `Unknown schema: ${schemaName}` }] };
  }

  if (data === null || data === undefined) {
    return { valid: false, errors: [{ field: '_root', message: 'Data is null or undefined' }] };
  }

  if (typeof data !== 'object' || Array.isArray(data)) {
    return { valid: false, errors: [{ field: '_root', message: 'Data must be an object' }] };
  }

  const errors: ValidationError[] = [];
  const record = data as Record<string, unknown>;

  for (const [fieldName, rules] of Object.entries(schemaDef.fields)) {
    const error = validateField(fieldName, record[fieldName], rules);
    if (error) errors.push(error);
  }

  return { valid: errors.length === 0, errors };
}

// ─── Schema Definitions ───

interface SchemaDef {
  fields: Record<string, Record<string, unknown>>;
}

export const BUILTIN_SCHEMAS: Record<string, SchemaDef> = {};

function registerBuiltinSchemas(): void {
  const schemas: Record<string, SchemaDef> = {
    // === Payment ===
    'stripe.charge': {
      fields: {
        amount: { type: 'number', required: true, gt: 0, description: 'Charge amount in cents' },
        currency: { type: 'string', required: false, pattern: '^[a-z]{3}$', default: 'usd' },
        description: { type: 'string', required: false },
        customer: { type: 'string', required: false },
      },
    },
    'stripe.refund': {
      fields: {
        charge_id: { type: 'string', required: true, minLength: 5 },
        amount: { type: 'number', required: false, gt: 0 },
        reason: { type: 'string', required: false },
      },
    },

    // === Email ===
    'email.send': {
      fields: {
        to: { type: 'string', required: true, pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$' },
        subject: { type: 'string', required: true, minLength: 1, maxLength: 998 },
        body: { type: 'string', required: true, minLength: 1 },
        cc: { type: 'array', required: false },
      },
    },
    'email.send_bulk': {
      fields: {
        to: { type: 'array', required: true, minLength: 1 },
        subject: { type: 'string', required: true, minLength: 1 },
        body: { type: 'string', required: true, minLength: 1 },
      },
    },

    // === GitHub ===
    'github.create_issue': {
      fields: {
        owner: { type: 'string', required: true, minLength: 1 },
        repo: { type: 'string', required: true, minLength: 1 },
        title: { type: 'string', required: true, minLength: 1, maxLength: 256 },
        body: { type: 'string', required: false },
        labels: { type: 'array', required: false },
      },
    },
    'github.create_pr': {
      fields: {
        owner: { type: 'string', required: true, minLength: 1 },
        repo: { type: 'string', required: true, minLength: 1 },
        title: { type: 'string', required: true, minLength: 1 },
        head: { type: 'string', required: true, minLength: 1 },
        base: { type: 'string', required: false, default: 'main' },
        body: { type: 'string', required: false },
      },
    },

    // === Database ===
    'db.query': {
      fields: {
        query: { type: 'string', required: true, minLength: 1 },
        params: { type: 'object', required: false },
      },
    },
    'db.insert': {
      fields: {
        table: {
          type: 'string',
          required: true,
          pattern: '^[a-zA-Z_][a-zA-Z0-9_]*$',
          minLength: 1,
        },
        values: { type: 'object', required: true },
      },
    },

    // === HTTP ===
    'http.request': {
      fields: {
        url: { type: 'string', required: true, pattern: '^https?://' },
        method: {
          type: 'string',
          required: false,
          pattern: '^(GET|POST|PUT|DELETE|PATCH)$',
          default: 'GET',
        },
        headers: { type: 'object', required: false },
        body: { type: 'object', required: false },
      },
    },

    // === File ===
    'file.read': {
      fields: {
        path: { type: 'string', required: true, minLength: 1 },
        encoding: { type: 'string', required: false, default: 'utf-8' },
      },
    },
    'file.write': {
      fields: {
        path: { type: 'string', required: true, minLength: 1 },
        content: { type: 'string', required: true },
        mode: { type: 'string', required: false, pattern: '^(w|a|x)$', default: 'w' },
      },
    },

    // === Slack ===
    'slack.message': {
      fields: {
        channel: { type: 'string', required: true, minLength: 1 },
        text: { type: 'string', required: true, minLength: 1 },
        thread_ts: { type: 'string', required: false },
      },
    },

    // === Jira ===
    'jira.create_ticket': {
      fields: {
        project: { type: 'string', required: true, minLength: 1, maxLength: 10 },
        summary: { type: 'string', required: true, minLength: 1 },
        description: { type: 'string', required: false },
        issue_type: {
          type: 'string',
          required: false,
          pattern: '^(Bug|Task|Story|Epic)$',
          default: 'Bug',
        },
        priority: {
          type: 'string',
          required: false,
          pattern: '^(Highest|High|Medium|Low|Lowest)$',
          default: 'Medium',
        },
      },
    },
  };

  Object.assign(BUILTIN_SCHEMAS, schemas);
}

registerBuiltinSchemas();

// ─── Built-in Schema Meta ───

export const BUILTIN_META: Record<string, SchemaMeta> = {
  'stripe.charge': {
    name: 'stripe.charge', version: '1.0.0', author: 'ark-core',
    category: 'payment', tags: ['stripe', 'charge', 'payment'],
    description: 'Stripe charge request schema', source: 'local', downloads: 0, rating: 0,
  },
  'stripe.refund': {
    name: 'stripe.refund', version: '1.0.0', author: 'ark-core',
    category: 'payment', tags: ['stripe', 'refund', 'payment'],
    description: 'Stripe refund request schema', source: 'local', downloads: 0, rating: 0,
  },
  'email.send': {
    name: 'email.send', version: '1.0.0', author: 'ark-core',
    category: 'email', tags: ['email', 'send'],
    description: 'Send single email schema', source: 'local', downloads: 0, rating: 0,
  },
  'email.send_bulk': {
    name: 'email.send_bulk', version: '1.0.0', author: 'ark-core',
    category: 'email', tags: ['email', 'bulk', 'send'],
    description: 'Send bulk emails schema', source: 'local', downloads: 0, rating: 0,
  },
  'github.create_issue': {
    name: 'github.create_issue', version: '1.0.0', author: 'ark-core',
    category: 'github', tags: ['github', 'issue'],
    description: 'GitHub create issue schema', source: 'local', downloads: 0, rating: 0,
  },
  'github.create_pr': {
    name: 'github.create_pr', version: '1.0.0', author: 'ark-core',
    category: 'github', tags: ['github', 'pr', 'pull request'],
    description: 'GitHub create pull request schema', source: 'local', downloads: 0, rating: 0,
  },
  'db.query': {
    name: 'db.query', version: '1.0.0', author: 'ark-core',
    category: 'database', tags: ['sql', 'query', 'database'],
    description: 'SQL query schema with parameterized params', source: 'local', downloads: 0, rating: 0,
  },
  'db.insert': {
    name: 'db.insert', version: '1.0.0', author: 'ark-core',
    category: 'database', tags: ['sql', 'insert', 'database'],
    description: 'SQL insert schema with table validation', source: 'local', downloads: 0, rating: 0,
  },
  'http.request': {
    name: 'http.request', version: '1.0.0', author: 'ark-core',
    category: 'http', tags: ['http', 'api', 'request'],
    description: 'HTTP API request schema', source: 'local', downloads: 0, rating: 0,
  },
  'file.read': {
    name: 'file.read', version: '1.0.0', author: 'ark-core',
    category: 'file', tags: ['file', 'read'],
    description: 'File read schema', source: 'local', downloads: 0, rating: 0,
  },
  'file.write': {
    name: 'file.write', version: '1.0.0', author: 'ark-core',
    category: 'file', tags: ['file', 'write'],
    description: 'File write schema', source: 'local', downloads: 0, rating: 0,
  },
  'slack.message': {
    name: 'slack.message', version: '1.0.0', author: 'ark-core',
    category: 'messaging', tags: ['slack', 'message', 'chat'],
    description: 'Slack message send schema', source: 'local', downloads: 0, rating: 0,
  },
  'jira.create_ticket': {
    name: 'jira.create_ticket', version: '1.0.0', author: 'ark-core',
    category: 'project', tags: ['jira', 'ticket', 'project'],
    description: 'Jira create ticket schema', source: 'local', downloads: 0, rating: 0,
  },
};

// ─── SchemaHub Class ───

export class SchemaHub {
  private schemas: Map<string, SchemaDef> = new Map();
  private metas: Map<string, SchemaMeta> = new Map();

  constructor(schemasDir?: string) {
    this.registerBuiltins();
    if (schemasDir) {
      this.importDir(schemasDir);
    }
  }

  /** Register a schema definition with optional metadata */
  register(
    name: string,
    schemaDef: SchemaDef,
    meta?: Partial<SchemaMeta>,
  ): void {
    this.schemas.set(name, schemaDef);
    this.metas.set(name, {
      name,
      version: '1.0.0',
      author: 'community',
      category: 'general',
      tags: [],
      description: '',
      source: 'local',
      downloads: 0,
      rating: 0,
      ...meta,
    });
  }

  private registerBuiltins(): void {
    for (const [name, schemaDef] of Object.entries(BUILTIN_SCHEMAS)) {
      this.schemas.set(name, schemaDef);
    }
    for (const [name, meta] of Object.entries(BUILTIN_META)) {
      this.metas.set(name, meta);
    }
  }

  // ─── Discovery ───

  get(name: string): SchemaDef | undefined {
    return this.schemas.get(name);
  }

  getMeta(name: string): SchemaMeta | undefined {
    return this.metas.get(name);
  }

  get available(): string[] {
    return [...this.schemas.keys()].sort();
  }

  get categories(): string[] {
    const seen = new Set<string>();
    for (const meta of this.metas.values()) {
      seen.add(meta.category);
    }
    return [...seen].sort();
  }

  search(options?: {
    query?: string;
    category?: string;
    tags?: string[];
    author?: string;
  }): SchemaMeta[] {
    const results: SchemaMeta[] = [];

    for (const meta of this.metas.values()) {
      if (options?.query) {
        const q = options.query.toLowerCase();
        if (
          !meta.name.toLowerCase().includes(q) &&
          !meta.description.toLowerCase().includes(q)
        ) {
          continue;
        }
      }
      if (options?.category && meta.category !== options.category) continue;
      if (options?.tags && !options.tags.every((t) => meta.tags.includes(t))) continue;
      if (options?.author && meta.author !== options.author) continue;
      results.push(meta);
    }

    return results;
  }

  listByCategory(): Record<string, SchemaMeta[]> {
    const result: Record<string, SchemaMeta[]> = {};
    for (const meta of this.metas.values()) {
      if (!result[meta.category]) result[meta.category] = [];
      result[meta.category].push(meta);
    }
    return result;
  }

  // ─── Import / Export ───

  importDir(dirPath: string): number {
    const d = path.resolve(dirPath);
    if (!fs.existsSync(d) || !fs.statSync(d).isDirectory()) return 0;

    let count = 0;
    const files = fs.readdirSync(d).filter((f) => f.endsWith('.json'));

    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(d, file), 'utf-8');
        const data = JSON.parse(content);

        const fieldsDef: Record<string, Record<string, unknown>> = {};
        for (const [fname, finfo] of Object.entries(data.fields ?? {})) {
          const info = finfo as Record<string, unknown>;
          const fieldRules: Record<string, unknown> = {
            type: info.type ?? 'string',
            required: info.required ?? true,
            description: info.description ?? '',
          };
          fieldsDef[fname] = fieldRules;
        }

        const schemaDef: SchemaDef = { fields: fieldsDef };
        this.register(data.name, schemaDef, {
          version: data.version ?? '1.0.0',
          author: data.author ?? 'community',
          category: data.category ?? 'general',
          tags: data.tags ?? [],
          description: data.description ?? '',
          source: 'local',
        });
        count++;
      } catch {
        // Skip invalid schema files
      }
    }

    return count;
  }

  exportJSON(filePath: string): void {
    const result: Record<string, unknown>[] = [];

    for (const [name, schemaDef] of this.schemas) {
      const meta = this.metas.get(name);
      result.push({
        name,
        version: meta?.version ?? '1.0.0',
        author: meta?.author ?? 'community',
        category: meta?.category ?? 'general',
        tags: meta?.tags ?? [],
        description: meta?.description ?? '',
        fields: schemaDef.fields,
      });
    }

    fs.writeFileSync(filePath, JSON.stringify(result, null, 2), 'utf-8');
  }

  exportMetaJSON(filePath: string): void {
    const result = [...this.metas.values()].map((m) => ({
      name: m.name,
      version: m.version,
      author: m.author,
      category: m.category,
      tags: m.tags,
      description: m.description,
      source: m.source,
      downloads: m.downloads,
      rating: m.rating,
    }));
    fs.writeFileSync(filePath, JSON.stringify(result, null, 2), 'utf-8');
  }

  // ─── Validation ───

  validate(
    name: string,
    data: unknown,
  ): { valid: boolean; errors: ValidationError[] } {
    return validateSchema(name, data);
  }

  // ─── Stats ───

  get stats(): Record<string, unknown> {
    const byCat = this.listByCategory();
    const allTags = new Set<string>();
    for (const meta of this.metas.values()) {
      for (const t of meta.tags) allTags.add(t);
    }
    const authors = new Set<string>();
    for (const meta of this.metas.values()) {
      authors.add(meta.author);
    }

    return {
      totalSchemas: this.schemas.size,
      categories: Object.keys(byCat).length,
      byCategory: Object.fromEntries(
        Object.entries(byCat).map(([k, v]) => [k, v.length]),
      ),
      totalTags: allTags.size,
      authors: authors.size,
    };
  }

  toString(): string {
    return `SchemaHub(schemas=${this.schemas.size}, categories=${this.categories.length})`;
  }
}
