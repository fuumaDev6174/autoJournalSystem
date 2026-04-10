/**
 * @module バリデーションミドルウェア
 * @description リクエストボディの構造を軽量にバリデーションする。外部ライブラリ不使用。
 */

import type { Request, Response, NextFunction } from 'express';

type FieldRule = 'required' | 'uuid' | 'string' | 'number' | 'object' | 'array';

interface SchemaField {
  rule: FieldRule;
  /** true の場合、フィールドが存在しなくてもエラーにしない */
  optional?: boolean;
}

type Schema = Record<string, FieldRule | SchemaField>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function check(value: unknown, rule: FieldRule): boolean {
  switch (rule) {
    case 'required': return value != null && value !== '';
    case 'uuid': return typeof value === 'string' && UUID_RE.test(value);
    case 'string': return typeof value === 'string';
    case 'number': return typeof value === 'number' && !Number.isNaN(value);
    case 'object': return value != null && typeof value === 'object' && !Array.isArray(value);
    case 'array': return Array.isArray(value);
  }
}

/**
 * リクエストボディをスキーマに従ってバリデーションするミドルウェアを返す。
 *
 * @example
 * router.post('/items', validateBody({ name: 'string', amount: 'number' }), handler);
 */
export function validateBody(schema: Schema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const errors: string[] = [];

    for (const [field, def] of Object.entries(schema)) {
      const isOptional = typeof def === 'object' && def.optional;
      const rule = typeof def === 'string' ? def : def.rule;
      const value = req.body?.[field];

      if (value == null || value === '') {
        if (!isOptional && rule !== 'required') {
          // optional でない場合、値がなければエラー
          errors.push(`${field} は必須です`);
        } else if (rule === 'required' && !isOptional) {
          errors.push(`${field} は必須です`);
        }
        continue;
      }

      if (!check(value, rule)) {
        errors.push(`${field} の形式が不正です (期待: ${rule})`);
      }
    }

    if (errors.length > 0) {
      res.status(400).json({ error: errors.join(', ') });
      return;
    }

    next();
  };
}
