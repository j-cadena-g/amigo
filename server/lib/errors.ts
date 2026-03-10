type ErrorCode =
  | "UNAUTHORIZED"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
  | "PERMISSION_DENIED"
  | "NOT_FOUND";

export class ActionError extends Error {
  constructor(
    public override message: string,
    public code: ErrorCode
  ) {
    super(message);
  }
}

export function logServerError(
  context: string,
  error: unknown,
  meta?: Record<string, unknown>
) {
  console.error(
    JSON.stringify({ context, error: String(error), ...meta, ts: Date.now() })
  );
}

export function logSecurityEvent(
  event: string,
  meta: Record<string, unknown>
) {
  console.log(JSON.stringify({ event, ...meta, ts: Date.now() }));
}
