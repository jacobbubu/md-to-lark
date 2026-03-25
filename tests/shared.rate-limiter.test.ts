import assert from 'node:assert/strict';
import test from 'node:test';
import { RateLimiter, sleep } from '../src/shared/rate-limiter.js';

test('sleep waits at least roughly the requested duration', async () => {
  const started = Date.now();
  await sleep(15);
  const elapsed = Date.now() - started;
  assert.ok(elapsed >= 10, `expected elapsed >= 10ms, got ${elapsed}ms`);
});

test('RateLimiter waits between consecutive calls', async () => {
  const limiter = new RateLimiter(35);

  await limiter.wait();
  const startedSecond = Date.now();
  await limiter.wait();
  const elapsedSecond = Date.now() - startedSecond;

  assert.ok(elapsedSecond >= 25, `expected second wait >= 25ms, got ${elapsedSecond}ms`);
});
