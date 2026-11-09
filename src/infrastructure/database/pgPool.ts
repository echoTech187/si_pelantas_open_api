import mysql, { Pool, PoolConnection } from 'mysql2/promise';
import { randomUUID } from 'crypto';
import { env } from '../../config/env';

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
}

export interface ClientLike {
  query: <T = any>(text: string, params?: any[]) => Promise<QueryResult<T>>;
  release: () => void;
}

export const mysqlPool: Pool = mysql.createPool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  ssl: env.DB_SSL ? { rejectUnauthorized: false } : undefined,
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
});

export async function executeQuery<T = any>(
  target: Pool | PoolConnection,
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  let sql = text.trim();

  // 1. Check for RETURNING clause
  const returningMatch = sql.match(/RETURNING\s+(.+)$/i);
  let returningFields: string | null = null;
  if (returningMatch) {
    returningFields = returningMatch[1].trim();
    sql = sql.replace(/RETURNING\s+.+$/i, '').trim();
  }

  // 2. Remove Postgres-specific casts
  sql = sql.replace(/::(int|text|float|numeric|jsonb|timestamptz|varchar)(\[\])?/gi, '');

  // 3. Interval conversion
  sql = sql.replace(/INTERVAL\s+'(\d+)\s+seconds'/gi, 'INTERVAL $1 SECOND');

  // 4. ANY($1) -> IN (?)
  sql = sql.replace(/=\s*ANY\s*\(\s*\$(\d+)\s*\)/gi, 'IN ($$1)');

  // 4b. string_agg(col, ', ') -> GROUP_CONCAT(col SEPARATOR ', ')
  sql = sql.replace(/string_agg\s*\(\s*([^,]+?)\s*,\s*('[^']*')\s*\)/gi, 'GROUP_CONCAT($1 SEPARATOR $2)');

  // 4c. Postgres to_char AT TIME ZONE -> DATE_FORMAT
  sql = sql.replace(/to_char\s*\(\s*([^,]+?)\s*AT\s+TIME\s+ZONE\s+'[^']+'\s*,\s*('[^']*')\s*\)/gi, "DATE_FORMAT($1, '%Y-%m-%d %H:%i')");

  // 5. ON CONFLICT DO NOTHING -> INSERT IGNORE
  if (/ON\s+CONFLICT\s+DO\s+NOTHING/i.test(sql)) {
    sql = sql.replace(/INSERT\s+INTO/i, 'INSERT IGNORE INTO');
    sql = sql.replace(/ON\s+CONFLICT\s+DO\s+NOTHING/gi, '');
  }

  // 6. ON CONFLICT (col) DO UPDATE ... -> ON DUPLICATE KEY UPDATE ...
  if (/ON\s+CONFLICT\s*\([^)]+\)\s*DO\s+UPDATE/i.test(sql)) {
    sql = sql.replace(/ON\s+CONFLICT\s*\([^)]+\)\s*DO\s+UPDATE\s+SET/i, 'ON DUPLICATE KEY UPDATE');
    sql = sql.replace(/EXCLUDED\.(\w+)/gi, 'VALUES($1)');
  }

  // 7. Check if INSERT needs an ID injected
  let injectedId: string | null = null;
  const insertMatch = sql.match(/INSERT\s+(?:IGNORE\s+)?INTO\s+([a-zA-Z0-9_`]+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
  if (insertMatch) {
    const tableName = insertMatch[1].replace(/`/g, '');
    const cols = insertMatch[2].split(',').map((c) => c.trim().toLowerCase());
    if (!cols.includes('id')) {
      injectedId = randomUUID();
      const newCols = `id, ${insertMatch[2]}`;
      const newVals = `?, ${insertMatch[3]}`;
      sql = sql.replace(insertMatch[0], `INSERT INTO \`${tableName}\` (${newCols}) VALUES (${newVals})`);
    }
  }

  // 8. Map $N parameters to ?
  const newValues: any[] = [];
  if (injectedId) {
    newValues.push(injectedId);
  }
  sql = sql.replace(/\$(\d+)/g, (_, numStr) => {
    const idx = parseInt(numStr, 10) - 1;
    let val = params && idx < params.length ? params[idx] : null;
    if (val !== null && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date)) {
      val = JSON.stringify(val);
    }
    newValues.push(val);
    return '?';
  });

  const [rawResult] = await target.query(sql, newValues);

  if (Array.isArray(rawResult)) {
    return {
      rows: rawResult as T[],
      rowCount: rawResult.length,
    };
  }

  const header = rawResult as any;
  const rowCount = header.affectedRows || 0;

  if (returningFields) {
    if (injectedId && insertMatch) {
      const tableName = insertMatch[1].replace(/`/g, '');
      const [fetched] = await target.query(`SELECT ${returningFields} FROM \`${tableName}\` WHERE id = ?`, [injectedId]);
      return {
        rows: fetched as T[],
        rowCount: (fetched as any[]).length,
      };
    }
    const idParam = params?.find((p) => typeof p === 'string' && /^[0-9a-f-]{36}$/i.test(p));
    if (idParam) {
      const tableMatch = sql.match(/(?:UPDATE|INSERT\s+INTO)\s+([a-zA-Z0-9_`]+)/i);
      if (tableMatch) {
        const tableName = tableMatch[1].replace(/`/g, '');
        const [fetched] = await target.query(`SELECT ${returningFields} FROM \`${tableName}\` WHERE id = ?`, [idParam]);
        return {
          rows: fetched as T[],
          rowCount: (fetched as any[]).length,
        };
      }
    }
  }

  return {
    rows: [],
    rowCount,
  };
}

export const pgPool = {
  query: <T = any>(text: string, params?: any[]) => executeQuery<T>(mysqlPool, text, params),
  connect: async (): Promise<ClientLike> => {
    const conn = await mysqlPool.getConnection();
    return {
      query: <T = any>(text: string, params?: any[]) => executeQuery<T>(conn, text, params),
      release: () => conn.release(),
    };
  },
};

export async function dbQuery<T = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  return executeQuery<T>(mysqlPool, text, params);
}

export async function withTransaction<T>(
  fn: (client: ClientLike) => Promise<T>
): Promise<T> {
  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();
    const clientWrapper: ClientLike = {
      query: <R = any>(text: string, params?: any[]) => executeQuery<R>(connection, text, params),
      release: () => {
        // no-op inside transaction until finally block
      },
    };
    const result = await fn(clientWrapper);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
