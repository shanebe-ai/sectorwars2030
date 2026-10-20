import { Request, Response, NextFunction, RequestHandler } from 'express';

// Small in-memory fixed window rate limiter. One server process (pm2
// fork mode) serves the whole game, so per process counters are enough
// and we avoid pulling in another dependency.
//
// Limits are per client IP. Behind nginx the real IP comes from
// X-Forwarded-For, which Express only trusts when 'trust proxy' is set
// (see index.ts).

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  name: string; // shown in logs and keeps counters separate per limiter
  message?: string;
  // Only count requests that end in an error (4xx/5xx). Used for login
  // so players who sign in fine are never locked out.
  failuresOnly?: boolean;
  // Defaults to on, except under Jest or when RATE_LIMIT_DISABLED=true.
  enabled?: boolean;
  now?: () => number; // injectable clock for tests
}

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimiter extends RequestHandler {
  reset: () => void;
}

const defaultEnabled = (): boolean =>
  process.env.RATE_LIMIT_DISABLED !== 'true' &&
  process.env.NODE_ENV !== 'test' &&
  process.env.JEST_WORKER_ID === undefined;

export const createRateLimiter = (options: RateLimitOptions): RateLimiter => {
  const { windowMs, max, name } = options;
  const message = options.message || 'Too many requests, please slow down and try again shortly.';
  const enabled = options.enabled ?? defaultEnabled();
  const now = options.now || Date.now;
  const buckets = new Map<string, Bucket>();

  // Drop expired buckets so the map cannot grow without bound.
  const sweep = setInterval(() => {
    const t = now();
    buckets.forEach((bucket, key) => {
      if (bucket.resetAt <= t) buckets.delete(key);
    });
  }, Math.max(windowMs, 60 * 1000));
  sweep.unref();

  const limiter = ((req: Request, res: Response, next: NextFunction) => {
    if (!enabled) return next();

    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    const t = now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= t) {
      bucket = { count: 0, resetAt: t + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count++;

    const resetSeconds = Math.max(0, Math.ceil((bucket.resetAt - t) / 1000));
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
    res.setHeader('RateLimit-Reset', String(resetSeconds));

    if (options.failuresOnly) {
      const counted = bucket;
      res.on('finish', () => {
        if (res.statusCode < 400 && counted.count > 0) counted.count--;
      });
    }

    if (bucket.count > max) {
      if (bucket.count === max + 1) {
        console.warn(`[RateLimit] ${name}: ${key} hit ${max} requests per ${windowMs / 1000}s`);
      }
      res.setHeader('Retry-After', String(resetSeconds));
      return res.status(429).json({ error: message, retryAfterSeconds: resetSeconds });
    }

    next();
  }) as RateLimiter;

  limiter.reset = () => buckets.clear();
  return limiter;
};

// Whole API: generous, only stops runaway scripts and floods.
export const apiLimiter = createRateLimiter({
  name: 'api',
  windowMs: 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_API_PER_MINUTE || '300', 10),
});

// Login: slows password guessing. Only failed attempts count.
export const loginLimiter = createRateLimiter({
  name: 'login',
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_LOGIN_PER_15MIN || '20', 10),
  failuresOnly: true,
  message: 'Too many login attempts. Please wait a few minutes and try again.',
});

// Registration: slows mass account creation.
export const registerLimiter = createRateLimiter({
  name: 'register',
  windowMs: 60 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_REGISTER_PER_HOUR || '10', 10),
  message: 'Too many new accounts from this address. Please try again later.',
});

/**
 * Value for app.set('trust proxy'). Defaults to 'loopback': trust
 * X-Forwarded-For only when the request came through a proxy on the
 * same machine (nginx), so clients hitting :3000 directly cannot spoof
 * their IP to dodge the limiter.
 */
export const parseTrustProxy = (value: string | undefined): boolean | number | string => {
  if (value === undefined || value === '') return 'loopback';
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^\d+$/.test(value)) return parseInt(value, 10);
  return value;
};
