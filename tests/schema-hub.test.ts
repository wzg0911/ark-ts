import { describe, it, expect, afterEach } from 'vitest';
import { SchemaHub, validateSchema, BUILTIN_SCHEMAS, BUILTIN_META, CATEGORIES } from '../src/schema-hub.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

describe('SchemaHub', () => {
  it('registers 13 built-in schemas', () => {
    const hub = new SchemaHub();
    expect(hub.available.length).toBe(13);
  });

  it('provides known schemas', () => {
    const hub = new SchemaHub();
    expect(hub.get('stripe.charge')).toBeDefined();
    expect(hub.get('email.send')).toBeDefined();
    expect(hub.get('http.request')).toBeDefined();
  });

  it('getMeta returns metadata', () => {
    const hub = new SchemaHub();
    const meta = hub.getMeta('stripe.charge');
    expect(meta).toBeDefined();
    expect(meta!.category).toBe('payment');
    expect(meta!.author).toBe('ark-core');
  });

  it('lists categories', () => {
    const hub = new SchemaHub();
    const cats = hub.categories;
    expect(cats).toContain('payment');
    expect(cats).toContain('email');
    expect(cats).toContain('http');
  });

  it('searches by query', () => {
    const hub = new SchemaHub();
    const results = hub.search({ query: 'stripe' });
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it('searches by category', () => {
    const hub = new SchemaHub();
    const results = hub.search({ category: 'email' });
    expect(results.length).toBe(2);
  });

  it('searches by tags (AND logic)', () => {
    const hub = new SchemaHub();
    const results = hub.search({ tags: ['github', 'issue'] });
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('github.create_issue');
  });

  it('searches by author', () => {
    const hub = new SchemaHub();
    const results = hub.search({ author: 'ark-core' });
    expect(results.length).toBe(13);
  });

  it('listByCategory groups schemas', () => {
    const hub = new SchemaHub();
    const grouped = hub.listByCategory();
    expect(Object.keys(grouped).length).toBeGreaterThanOrEqual(8);
    expect(grouped.payment).toBeDefined();
    expect(grouped.payment.length).toBe(2);
  });

  it('stats returns correct counts', () => {
    const hub = new SchemaHub();
    const s = hub.stats;
    expect(s.totalSchemas).toBe(13);
    expect(s.totalTags).toBeGreaterThan(0);
    expect(s.authors).toBeGreaterThan(0);
  });

  it('importJSON loads from file', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-schema-'));
    const schemaPath = path.join(tmpDir, 'test_schema.json');
    fs.writeFileSync(schemaPath, JSON.stringify({
      name: 'custom.say_hello',
      version: '1.0.0',
      category: 'ai',
      tags: ['custom', 'greeting'],
      description: 'Say hello schema',
      fields: {
        name: { type: 'string', required: true, description: 'Name to greet' },
        greeting: { type: 'string', required: false, description: 'Greeting type' },
      },
    }));

    const hub = new SchemaHub();
    const count = hub.importDir(tmpDir);
    expect(count).toBe(1);
    expect(hub.get('custom.say_hello')).toBeDefined();

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('exportJSON writes file', () => {
    const tmpFile = path.join(os.tmpdir(), 'ark-export-test.json');
    const hub = new SchemaHub();
    hub.exportJSON(tmpFile);
    const content = JSON.parse(fs.readFileSync(tmpFile, 'utf-8'));
    expect(Array.isArray(content)).toBe(true);
    expect(content.length).toBe(13);
    fs.rmSync(tmpFile, { force: true });
  });

  it('exportMetaJSON writes metadata file', () => {
    const tmpFile = path.join(os.tmpdir(), 'ark-meta-export.json');
    const hub = new SchemaHub();
    hub.exportMetaJSON(tmpFile);
    const content = JSON.parse(fs.readFileSync(tmpFile, 'utf-8'));
    expect(content.length).toBe(13);
    expect(content[0].name).toBeDefined();
    expect(content[0].version).toBeDefined();
    fs.rmSync(tmpFile, { force: true });
  });

  it('validate validates built-in schemas', () => {
    const hub = new SchemaHub();
    // Valid stripe charge
    const result = hub.validate('stripe.charge', { amount: 2000, currency: 'usd' });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('validate rejects invalid data', () => {
    const hub = new SchemaHub();
    const result = hub.validate('stripe.charge', {});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('validate rejects unknown schema', () => {
    const hub = new SchemaHub();
    const result = hub.validate('unknown.schema', {});
    expect(result.valid).toBe(false);
    expect(result.errors[0].field).toBe('_schema');
  });

  it('toString returns summary', () => {
    const hub = new SchemaHub();
    expect(hub.toString()).toContain('SchemaHub');
    expect(hub.toString()).toContain('13');
  });
});

describe('BUILTIN_SCHEMAS / BUILTIN_META', () => {
  it('BUILTIN_SCHEMAS has all 13 entries', () => {
    expect(Object.keys(BUILTIN_SCHEMAS).length).toBe(13);
  });

  it('BUILTIN_META has all 13 entries', () => {
    expect(Object.keys(BUILTIN_META).length).toBe(13);
  });

  it('CATEGORIES includes key values', () => {
    expect(CATEGORIES).toContain('payment');
    expect(CATEGORIES).toContain('email');
    expect(CATEGORIES).toContain('http');
    expect(CATEGORIES).toContain('file');
  });
});

describe('validateSchema utility', () => {
  it('validates stripe.charge with amount', () => {
    const result = validateSchema('stripe.charge', { amount: 5000, currency: 'usd' });
    expect(result.valid).toBe(true);
  });

  it('rejects missing required fields', () => {
    const result = validateSchema('email.send', { to: 'test@test.com' });
    // subject and body are required
    expect(result.valid).toBe(false);
  });

  it('rejects invalid email', () => {
    const result = validateSchema('email.send', {
      to: 'not-an-email',
      subject: 'Hi',
      body: 'Hello',
    });
    expect(result.valid).toBe(false);
  });

  it('validates HTTP request URL', () => {
    const r1 = validateSchema('http.request', { url: 'https://api.example.com' });
    expect(r1.valid).toBe(true);
    const r2 = validateSchema('http.request', { url: 'ftp://bad.com' });
    expect(r2.valid).toBe(false);
  });

  it('rejects null data', () => {
    const result = validateSchema('http.request', null);
    expect(result.valid).toBe(false);
  });

  it('rejects unknown schema', () => {
    const result = validateSchema('nope.xyz', { foo: 1 });
    expect(result.valid).toBe(false);
  });
});