import express from 'express';
import { AddressInfo } from 'net';
import { Server } from 'http';
import { createRateLimiter, parseTrustProxy, RateLimiter } from '../middleware/rateLimit';

describe('Rate limiting', () => {
  let server: Server;
  let baseUrl: string;
  let clock: number;
  let limiter: RateLimiter;

  const startApp = async (trustProxy: boolean | number | string = 'loopback') => {
    const app = express();
    app.set('trust proxy', trustProxy);
    app.get('/health', (_req, res) => res.json({ ok: true }));
    app.use('/api', limiter);
    app.get('/api/ping', (req, res) => res.json({ ip: req.ip }));
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => resolve());
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  };

  beforeEach(async () => {
    clock = 1_000_000;
    limiter = createRateLimiter({
      name: 'test',
      windowMs: 60 * 1000,
      max: 3,
      enabled: true,
      now: () => clock,
    });
    await startApp();
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('allows requests up to the limit and sets headers', async () => {
    for (let i = 0; i < 3; i++) {
      const res = await fetch(`${baseUrl}/api/ping`);
      expect(res.status).toBe(200);
      expect(res.headers.get('ratelimit-limit')).toBe('3');
      expect(res.headers.get('ratelimit-remaining')).toBe(String(2 - i));
    }
  });

  it('returns 429 with Retry-After once over the limit', async () => {
    for (let i = 0; i < 3; i++) await fetch(`${baseUrl}/api/ping`);
    const res = await fetch(`${baseUrl}/api/ping`);
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('60');
    const body: any = await res.json();
    expect(body.error).toMatch(/too many requests/i);
    expect(body.retryAfterSeconds).toBe(60);
  });

  it('opens up again when the window passes', async () => {
    for (let i = 0; i < 4; i++) await fetch(`${baseUrl}/api/ping`);
    clock += 60 * 1000;
    const res = await fetch(`${baseUrl}/api/ping`);
    expect(res.status).toBe(200);
  });

  it('never limits the health check', async () => {
    for (let i = 0; i < 4; i++) await fetch(`${baseUrl}/api/ping`);
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
  });

  it('counts each client IP separately behind a local proxy', async () => {
    const asClient = (ip: string) =>
      fetch(`${baseUrl}/api/ping`, { headers: { 'X-Forwarded-For': ip } });
    for (let i = 0; i < 3; i++) await asClient('203.0.113.1');
    expect((await asClient('203.0.113.1')).status).toBe(429);
    const other = await asClient('203.0.113.2');
    expect(other.status).toBe(200);
    expect(((await other.json()) as any).ip).toBe('203.0.113.2');
  });

  it('ignores spoofed X-Forwarded-For when proxies are not trusted', async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    limiter.reset();
    await startApp(false);
    for (let i = 0; i < 3; i++) {
      await fetch(`${baseUrl}/api/ping`, { headers: { 'X-Forwarded-For': `198.51.100.${i}` } });
    }
    const res = await fetch(`${baseUrl}/api/ping`, { headers: { 'X-Forwarded-For': '198.51.100.99' } });
    expect(res.status).toBe(429);
  });

  it('can count only failed requests', async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    limiter = createRateLimiter({
      name: 'failures',
      windowMs: 60 * 1000,
      max: 2,
      enabled: true,
      failuresOnly: true,
      now: () => clock,
    });
    const app = express();
    app.use(express.json());
    app.post('/login', limiter, (req, res) =>
      req.body.ok ? res.json({ ok: true }) : res.status(401).json({ error: 'bad' })
    );
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => resolve());
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const attempt = (ok: boolean) =>
      fetch(`${baseUrl}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok }),
      });

    // Plenty of good logins never trip the limit.
    for (let i = 0; i < 5; i++) expect((await attempt(true)).status).toBe(200);
    // Two failures are allowed, the third request is blocked.
    expect((await attempt(false)).status).toBe(401);
    expect((await attempt(false)).status).toBe(401);
    expect((await attempt(true)).status).toBe(429);
  });

  it('is a no op when disabled', async () => {
    const off = createRateLimiter({ name: 'off', windowMs: 1000, max: 0, enabled: false });
    const next = jest.fn();
    off({ ip: '1.2.3.4' } as any, {} as any, next);
    expect(next).toHaveBeenCalled();
  });

  it('is disabled by default under Jest so other suites are unaffected', () => {
    const def = createRateLimiter({ name: 'default', windowMs: 1000, max: 0 });
    const next = jest.fn();
    def({ ip: '1.2.3.4' } as any, {} as any, next);
    expect(next).toHaveBeenCalled();
  });

  it('parses TRUST_PROXY values', () => {
    expect(parseTrustProxy(undefined)).toBe('loopback');
    expect(parseTrustProxy('')).toBe('loopback');
    expect(parseTrustProxy('true')).toBe(true);
    expect(parseTrustProxy('false')).toBe(false);
    expect(parseTrustProxy('2')).toBe(2);
    expect(parseTrustProxy('loopback, 10.0.0.1')).toBe('loopback, 10.0.0.1');
  });
});
