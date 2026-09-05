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
 * matching `expected`. The compare is length-constant to avoid leaking the
 * token's length/prefix via response timing.
 */
export function isAuthorized(req: Request, expected: string): boolean {
  const header = req.headers.get("authorization");
  if (!header) return false;
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) return false;
  return timingSafeEqual(match[1]!, expected);
}

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  // Compare against a fixed-length buffer so the loop count doesn't depend on
  // the attacker-supplied string's length.
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < ab.length; i++) {
    diff |= ab[i]! ^ (bb[i] ?? 0);
  }
  return diff === 0;
}
