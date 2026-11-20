const SENSITIVE_KEY_PATTERN =
  /pass|password|authkey|auth_key|token|secret|authorization|cookie|email/i;

const MAX_STRING_LEN = 500;
const MAX_DEPTH = 6;

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    const cleaned = value.replace(/[\r\n\t]/g, ' ');
    return cleaned.length > MAX_STRING_LEN
      ? `${cleaned.slice(0, MAX_STRING_LEN)}...[truncated]`
      : cleaned;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (depth >= MAX_DEPTH) {
    return '[MaxDepth]';
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeValue(value.message, depth + 1),
    };
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeValue(item, depth + 1));
  }

  if (typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        output[key] = '[REDACTED]';
      } else {
        output[key] = sanitizeValue(val, depth + 1);
      }
    }
    return output;
  }

  return String(value);
}

export function redactForLog<T>(payload: T): unknown {
  return sanitizeValue(payload, 0);
}

function writeLog(
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG',
  message: string,
  meta?: Record<string, unknown>
): void {
  const entry = {
    level,
    timestamp: new Date().toISOString(),
    message: sanitizeValue(message),
    ...(meta ? { meta: sanitizeValue(meta) } : {}),
  };

  const serialized = JSON.stringify(entry);
  if (level === 'ERROR') {
    console.error(serialized);
  } else if (level === 'WARN') {
    console.warn(serialized);
  } else {
    console.log(serialized);
  }
}

export const logger = {
  info: (message: string, meta?: Record<string, unknown>) =>
    writeLog('INFO', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) =>
    writeLog('WARN', message, meta),
  error: (message: string, meta?: Record<string, unknown>) =>
    writeLog('ERROR', message, meta),
  debug: (message: string, meta?: Record<string, unknown>) =>
    writeLog('DEBUG', message, meta),
};
