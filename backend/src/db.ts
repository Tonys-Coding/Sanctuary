import { Pool, PoolClient, types } from 'pg';
import fs from 'fs';
import path from 'path';
import { env } from './env';

// DATE → 'YYYY-MM-DD' string (no timezone shifting); NUMERIC and BIGINT → number.
types.setTypeParser(1082, (v) => v);
types.setTypeParser(1700, (v) => parseFloat(v));
types.setTypeParser(20, (v) => parseInt(v, 10));

export const pool = new Pool({
  connectionString: env.databaseUrl,
  options: '-c search_path=sanctuary',
});

type Runner = Pick<PoolClient, 'query'>;

export async function q<T = any>(sql: string, params: unknown[] = [], runner: Runner = pool): Promise<T[]> {
  const res = await runner.query(sql, params as any[]);
  return res.rows as T[];
}

export async function one<T = any>(sql: string, params: unknown[] = [], runner: Runner = pool): Promise<T | undefined> {
  return (await q<T>(sql, params, runner))[0];
}

export async function tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function migrate(): Promise<void> {
  const file = [path.join(__dirname, 'schema.sql'), path.join(__dirname, '..', 'src', 'schema.sql')].find((f) => fs.existsSync(f));
  if (!file) throw new Error('schema.sql not found');
  await pool.query(fs.readFileSync(file, 'utf8'));
}
