export function parseApiError(
  body: { error?: string; message?: string } | null,
  fallback: string
): string {
  return body?.error ?? body?.message ?? fallback;
}
