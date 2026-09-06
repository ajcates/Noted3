/**
 * Auth Middleware (system-overview.md §1).
 *
 * A single shared bearer token, checked on every request before it reaches a
 * handler (spec.md §11). This is deliberately minimal — appropriate while the
 * server stays on a home network. If it is ever exposed further this needs to
 * become more than a string compare; that decision is tracked in spec.md §11
 * and ISSUES.md.
 */

/**
 * Return `true` iff the request carries `Authorization: Bearer <token>`
 * matching `expected`. The compare runs in time independent of *how much of
 * the expected token is correct*, so an attacker can't recover it byte by
 * byte from response timing. (It still runs longer for a longer supplied
 * string — an acceptable leak for a single static home-network token.)
 */
export function isAuthorized(req: Request, expected: string): boolean {
  const header = req.headers.get("authorization");
  if (!header) return false;
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) return false;
  return constantTimeEqual(match[1]!, expected);
}

function constantTimeEqual(supplied: string, expected: string): boolean {
  const enc = new TextEncoder();
  const a = enc.encode(supplied);
  const b = enc.encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i]! ^ (b[i] ?? 0);
  }
  return diff === 0;
}
