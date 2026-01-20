/**
 * Error handling utilities for server actions.
 * In production, sensitive error details are logged server-side but generic messages are returned to clients.
 */

const isProduction = process.env.NODE_ENV === "production";

/**
 * Error codes that are safe to expose to clients (they don't aid in enumeration attacks)
 */
const SAFE_ERROR_CODES = new Set([
  "UNAUTHORIZED",
  "VALIDATION_ERROR",
  "RATE_LIMITED",
  "PERMISSION_DENIED",
]);

/**
 * A map of internal error messages to generic client-safe versions.
 * Add entries here for errors that should be sanitized in production.
 */
const ERROR_SANITIZATION_MAP: Record<string, string> = {
  // Resource not found errors - these could aid enumeration attacks
  "Item not found": "Operation failed",
  "Tag not found": "Operation failed",
  "Transaction not found": "Operation failed",
  "Budget not found": "Operation failed",
  "Asset not found": "Operation failed",
  "Debt not found": "Operation failed",
  "User not found": "Operation failed",
  "User not found in household": "Operation failed",
  // Database/internal errors
  "Failed to insert grocery item": "Operation failed",
  "Failed to update member role": "Operation failed",
  "Failed to transfer ownership": "Operation failed",
  "Failed to get data summary": "Operation failed",
  "Failed to remove member": "Operation failed",
  "Failed to get members": "Operation failed",
};

export class ActionError extends Error {
  public readonly code: string;
  public readonly internalMessage: string;

  constructor(message: string, code = "OPERATION_FAILED") {
    super(message);
    this.name = "ActionError";
    this.code = code;
    this.internalMessage = message;
  }

  /**
   * Get the client-safe error message.
   * In production, sensitive messages are replaced with generic ones.
   */
  getClientMessage(): string {
    if (!isProduction) {
      return this.message;
    }

    // Check if this error code is safe to expose
    if (SAFE_ERROR_CODES.has(this.code)) {
      return this.message;
    }

    // Check if this message should be sanitized
    return ERROR_SANITIZATION_MAP[this.message] ?? "Operation failed";
  }
}

/**
 * Create an ActionError for "not found" scenarios.
 * These errors are sanitized in production to prevent enumeration attacks.
 */
export function notFoundError(resourceType: string): ActionError {
  return new ActionError(`${resourceType} not found`, "NOT_FOUND");
}

/**
 * Create an ActionError for unauthorized access.
 * Safe to expose in production.
 */
export function unauthorizedError(): ActionError {
  return new ActionError("Unauthorized", "UNAUTHORIZED");
}

/**
 * Create an ActionError for permission denied scenarios.
 * Safe to expose in production.
 */
export function permissionDeniedError(message = "Permission denied"): ActionError {
  return new ActionError(message, "PERMISSION_DENIED");
}

/**
 * Sanitize an error message for client consumption.
 * In development, returns the original message.
 * In production, returns a generic message for sensitive errors.
 */
export function sanitizeErrorMessage(message: string): string {
  if (!isProduction) {
    return message;
  }
  return ERROR_SANITIZATION_MAP[message] ?? message;
}

/**
 * Log an error server-side with context.
 * Always logs the full error details for debugging.
 */
export function logServerError(
  context: string,
  error: unknown,
  metadata?: Record<string, unknown>
): void {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  // In production, use structured logging
  if (isProduction) {
    console.error(
      JSON.stringify({
        level: "error",
        context,
        message: errorMessage,
        stack: errorStack,
        ...metadata,
        timestamp: new Date().toISOString(),
      })
    );
  } else {
    // In development, use human-readable format
    console.error(`[${context}]`, errorMessage, metadata ?? "");
    if (errorStack) {
      console.error(errorStack);
    }
  }
}

/**
 * Log a security-relevant event for auditing purposes.
 * These events indicate account recovery, permission changes, or other sensitive operations.
 */
export function logSecurityEvent(
  event: string,
  metadata: Record<string, unknown>
): void {
  const logEntry = {
    level: "security",
    event,
    ...metadata,
    timestamp: new Date().toISOString(),
  };

  if (isProduction) {
    // Structured JSON for log aggregation systems
    console.log(JSON.stringify(logEntry));
  } else {
    // Human-readable for development
    console.log(`[SECURITY] ${event}`, metadata);
  }
}
