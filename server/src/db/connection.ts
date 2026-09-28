import { Pool, PoolConfig } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

function buildPoolConfig(): PoolConfig {
  const base: PoolConfig = {
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  };

  // A single DATABASE_URL (Railway, Render, etc.) takes precedence when set.
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    return {
      ...base,
      host: url.hostname,
      port: url.port ? parseInt(url.port, 10) : 5432,
      database: decodeURIComponent(url.pathname.replace(/^\//, '')),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      // Managed Postgres providers (Railway, Render) require TLS.
      ssl: url.searchParams.get('sslmode') === 'disable' ? false : { rejectUnauthorized: false },
    };
  }

  return {
    ...base,
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'tradewars',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
  };
}

const poolConfig: PoolConfig = buildPoolConfig();

export const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

export const query = async (text: string, params?: any[]) => {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;

  if (process.env.NODE_ENV === 'development') {
    console.log('Executed query', { text, duration, rows: res.rowCount });
  }

  return res;
};

export const getClient = () => pool.connect();
