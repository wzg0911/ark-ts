/**
 * OutputValidator — 输出验证器
 * Gene source: IDE static type checking
 * Validates agent output against Zod schemas.
 */
import { z, ZodSchema } from 'zod';

export interface ValidationResult {
  valid: boolean;
  data?: unknown;
  errors?: string[];
}

export class OutputValidator {
  passed = 0;
  blocked = 0;
  private validations = 0;

  validate<T>(schema: ZodSchema<T>, output: unknown): ValidationResult {
    this.validations++;
    const result = schema.safeParse(output);
    if (result.success) {
      this.passed++;
      return { valid: true, data: result.data };
    }
    this.blocked++;
    return {
      valid: false,
      errors: result.error.issues.map(
        (i) => `${i.path.join('.')}: ${i.message}`,
      ),
    };
  }

  /** Quick-check an object against a simple shape */
  validateShape(
    output: unknown,
    expected: Record<string, string>,
  ): ValidationResult {
    if (output === null || output === undefined) {
      return { valid: false, errors: ['Output is null/undefined'] };
    }
    if (typeof output !== 'object') {
      return { valid: false, errors: ['Output is not an object'] };
    }
    const obj = output as Record<string, unknown>;
    const errors: string[] = [];
    for (const [key, type] of Object.entries(expected)) {
      if (!(key in obj)) errors.push(`${key} is missing`);
      else if (typeof obj[key] !== type)
        errors.push(`${key} should be ${type}, got ${typeof obj[key]}`);
    }
    this.validations++;
    if (errors.length === 0) {
      this.passed++;
      return { valid: true, data: obj };
    }
    this.blocked++;
    return { valid: false, errors };
  }

  get stats() {
    return {
      passed: this.passed,
      blocked: this.blocked,
      validations: this.validations,
      blockRate:
        this.validations > 0
          ? `${((this.blocked / this.validations) * 100).toFixed(1)}%`
          : '0%',
    };
  }
}
