import { z } from 'zod';
import { isoDate } from '../http';

/** Optional free text: trims, and turns '' into null so the database never stores empty strings. */
export const text = (max = 300) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), z.string().trim().max(max).nullish());
export const date = z.string().regex(isoDate);
export const optDate = z.preprocess((v) => (v === '' ? null : v), date.nullish());
export const uuid = z.string().uuid();
export const optUuid = z.preprocess((v) => (v === '' ? null : v), uuid.nullish());
export const money = z.coerce.number().positive().max(99_999_999).transform((n) => Math.round(n * 100) / 100);
export const method = z.enum(['cash', 'check', 'card', 'transfer', 'other']);
