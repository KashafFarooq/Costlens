// Token-window rate limiter: at most `max` actions per `windowMs`.
export function createLimiter({ max, windowMs, now = () => Date.now() }) {
  let hits = [];
  return {
    tryAcquire() {
      const t = now();
      hits = hits.filter((h) => t - h < windowMs);
      if (hits.length >= max) return { ok: false, retryAfterMs: windowMs - (t - hits[0]) };
      hits.push(t);
      return { ok: true, retryAfterMs: 0 };
    },
  };
}
