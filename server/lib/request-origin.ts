const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function isUnsafeHttpMethod(method: string): boolean {
  return UNSAFE_METHODS.has(method.toUpperCase());
}

export function normalizeAllowedOrigin(origin: string | undefined): string | null {
  if (!origin?.trim()) return null;
  try {
    const parsed = new URL(origin.trim());
    if (parsed.pathname !== "/" || parsed.search || parsed.hash) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export function requestMatchesAllowedOrigin(
  request: Request,
  allowedOriginValue: string | undefined
): boolean {
  const allowedOrigin = normalizeAllowedOrigin(allowedOriginValue);
  if (!allowedOrigin) return false;

  const origin = request.headers.get("Origin");
  if (origin) {
    return origin === allowedOrigin;
  }
  return false;
}
