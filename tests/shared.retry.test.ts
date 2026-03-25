import assert from 'node:assert/strict';
import test from 'node:test';
import { withRetry } from '../src/shared/retry.js';

function mockImmediateTimers(t: test.TestContext): void {
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = ((handler: TimerHandler, _timeout?: number, ...args: unknown[]) => {
    if (typeof handler === 'function') {
      handler(...args);
    }
    return 0 as unknown as NodeJS.Timeout;
  }) as typeof setTimeout;
  t.after(() => {
    globalThis.setTimeout = originalSetTimeout;
  });
}

test('withRetry returns immediately on first success', async () => {
  let calls = 0;
  const result = await withRetry('immediate-success', async () => {
    calls += 1;
    return 'ok';
  });

  assert.equal(result, 'ok');
  assert.equal(calls, 1);
});

test('withRetry retries on HTTP 429 and eventually succeeds', async (t) => {
  mockImmediateTimers(t);
  let calls = 0;
  const originalWarn = console.warn;
  console.warn = () => {};
  t.after(() => {
    console.warn = originalWarn;
  });

  const result = await withRetry(
    'retry-429',
    async () => {
      calls += 1;
      if (calls < 3) {
        throw {
          response: {
            status: 429,
            headers: {
              'retry-after': '1',
            },
          },
          message: 'too many requests',
        };
      }
      return 'done';
    },
    5,
  );

  assert.equal(result, 'done');
  assert.equal(calls, 3);
});

test('withRetry retries on api code 99991400 from nested response', async (t) => {
  mockImmediateTimers(t);
  let calls = 0;
  const originalWarn = console.warn;
  console.warn = () => {};
  t.after(() => {
    console.warn = originalWarn;
  });

  const result = await withRetry(
    'retry-api-code',
    async () => {
      calls += 1;
      if (calls < 2) {
        throw [
          {
            error: {
              code: 99991400,
              msg: 'request trigger frequency limit',
            },
          },
        ];
      }
      return 42;
    },
    4,
  );

  assert.equal(result, 42);
  assert.equal(calls, 2);
});

test('withRetry fails fast for non-retryable errors', async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      withRetry(
        'non-retryable',
        async () => {
          calls += 1;
          throw {
            response: {
              status: 400,
            },
            message: 'bad request',
          };
        },
        5,
      ),
    /non-retryable failed after 1 attempt\(s\): status=400 bad request/,
  );
  assert.equal(calls, 1);
});
