import type { NextFunction, Request, Response } from 'express';

const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function configuredOrigins(): string[] {
  return (process.env.WEB_ORIGIN || 'http://localhost:3000')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

/**
 * Defends cookie-authenticated state-changing endpoints against cross-site
 * requests. Requests without an Origin header are allowed because non-browser
 * clients still need the session cookie; browser CSRF always sends Origin.
 */
export function originGuard(req: Request, res: Response, next: NextFunction) {
  if (!unsafeMethods.has(req.method)) return next();

  const origin = req.get('origin');
  if (!origin) return next();

  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return res.status(403).json({ error: 'Invalid request origin' });
  }

  const allowed = configuredOrigins();
  const host = req.get('host');
  const sameHost = Boolean(host && parsed.host === host);
  const configured = allowed.includes(origin);
  const localDev =
    process.env.NODE_ENV !== 'production' &&
    (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');

  if (!sameHost && !configured && !localDev) {
    return res.status(403).json({ error: 'Request origin is not allowed' });
  }

  return next();
}
