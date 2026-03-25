import { sleep } from './rate-limiter.js';

function toObjectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function getString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value : '';
}

function collectErrorRecords(error: unknown): Record<string, unknown>[] {
  const queue: unknown[] = [error];
  const seen = new Set<unknown>();
  const records: Record<string, unknown>[] = [];

  while (queue.length > 0 && records.length < 20) {
    const current = queue.shift();
    if (current == null) continue;
    if (typeof current === 'object') {
      if (seen.has(current)) continue;
      seen.add(current);
    }
    if (Array.isArray(current)) {
      for (const item of current) {
        queue.push(item);
      }
      continue;
    }
    const row = toObjectRecord(current);
    if (!row) continue;
    records.push(row);
    queue.push(row.response, row.data, row.error, row.cause);
  }

  return records;
}

function toNumberFromUnknown(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim());
  return undefined;
}

function getErrorHttpStatus(error: unknown): number | undefined {
  const records = collectErrorRecords(error);
  for (const row of records) {
    const status = toNumberFromUnknown(row.status);
    if (status) return status;
  }
  return undefined;
}

function getErrorApiCode(error: unknown): string | number | undefined {
  const records = collectErrorRecords(error);
  for (const row of records) {
    const code = row.code;
    if (typeof code === 'number' || typeof code === 'string') return code;
  }
  return undefined;
}

function getRetryAfterMs(error: unknown): number | undefined {
  const records = collectErrorRecords(error);
  for (const row of records) {
    const headers = toObjectRecord(row.headers);
    if (!headers) continue;
    const rawRetryAfter = headers['retry-after'] ?? headers['Retry-After'];
    let value: unknown = rawRetryAfter;
    if (Array.isArray(value)) {
      value = value[0];
    }
    const asNumber = toNumberFromUnknown(value);
    if (asNumber && asNumber > 0) {
      return asNumber * 1000;
    }
  }
  return undefined;
}

function getErrorText(error: unknown): string {
  const textParts: string[] = [];
  if (error instanceof Error && error.message) {
    textParts.push(error.message);
  }
  const records = collectErrorRecords(error);
  for (const row of records) {
    const message = getString(row, 'message');
    const msg = getString(row, 'msg');
    if (message) textParts.push(message);
    if (msg) textParts.push(msg);
  }
  return textParts.join(' | ');
}

function isRetryableError(error: unknown): boolean {
  const status = getErrorHttpStatus(error);
  if (status && [429, 502, 503, 504].includes(status)) {
    return true;
  }
  const apiCode = getErrorApiCode(error);
  if (String(apiCode) === '99991400') {
    return true;
  }
  const text = getErrorText(error).toLowerCase();
  return /429|too many requests|rate|frequency|request trigger frequency limit|timeout|timed out|econnreset|eai_again|502|503|504/.test(
    text,
  );
}

function formatErrorForLog(error: unknown): string {
  const status = getErrorHttpStatus(error);
  const apiCode = getErrorApiCode(error);
  const text = getErrorText(error) || String(error);
  const prefixes: string[] = [];
  if (status) prefixes.push(`status=${status}`);
  if (apiCode != null) prefixes.push(`code=${String(apiCode)}`);
  const prefix = prefixes.length > 0 ? `${prefixes.join(' ')} ` : '';
  return `${prefix}${text}`;
}

export async function withRetry<T>(label: string, run: () => Promise<T>, attempts = 7): Promise<T> {
  let lastError: unknown;
  let usedAttempts = 0;
  for (let i = 0; i < attempts; i += 1) {
    usedAttempts = i + 1;
    try {
      return await run();
    } catch (error) {
      lastError = error;
      if (!isRetryableError(error) || i === attempts - 1) {
        break;
      }
      const retryAfterMs = getRetryAfterMs(error);
      const backoffMs = retryAfterMs ?? Math.min(30_000, 800 * 2 ** i);
      const jitterMs = Math.floor(Math.random() * 300);
      const delayMs = backoffMs + jitterMs;
      console.warn(
        `[retry] ${label} attempt ${i + 1}/${attempts} failed: ${formatErrorForLog(error)}; retrying in ${delayMs}ms`,
      );
      await sleep(delayMs);
    }
  }
  throw new Error(`${label} failed after ${usedAttempts} attempt(s): ${formatErrorForLog(lastError)}`);
}
