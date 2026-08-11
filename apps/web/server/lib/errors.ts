export type ErrorCode =
  | "UNAUTHORIZED"
  | "VALIDATION_ERROR"
  | "INTERNAL_ERROR"
  | "RATE_LIMITED"
  | "PERMISSION_DENIED"
  | "NOT_FOUND"
  | "CONFLICT";

export const ERROR_STATUS_BY_CODE: Record<ErrorCode, number> = {
  UNAUTHORIZED: 401,
  VALIDATION_ERROR: 400,
  INTERNAL_ERROR: 500,
  RATE_LIMITED: 429,
  PERMISSION_DENIED: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
};

export class ActionError extends Error {
  constructor(
    public override message: string,
    public code: ErrorCode
  ) {
    super(message);
  }
}

/** Standard API error envelope: always includes `code`. */
export function jsonError(
  message: string,
  code: ErrorCode,
  extra?: Record<string, unknown>
): Response {
  return Response.json(
    { error: message, code, ...extra },
    { status: ERROR_STATUS_BY_CODE[code] }
  );
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
