/**
 * Dev-server checks for /dev/agent-signin. The Worker only sees the
 * client-supplied Host header, so the Vite middleware in vite.config.ts uses
 * these on the real connection before a request reaches the Worker.
 */

/** Headers a proxy or tunnel (cloudflared, ngrok, a reverse proxy) adds. */
const FORWARDING_HEADERS = [
  "forwarded",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-real-ip",
  "cf-connecting-ip",
];

interface IncomingRequestLike {
  socket: { remoteAddress?: string };
  headers: Record<string, string | string[] | undefined>;
}

/** A browser on this machine talking to the dev server directly: no LAN peer, no proxy. */
export function isDirectLocalRequest(req: IncomingRequestLike): boolean {
  const address = req.socket.remoteAddress?.replace(/^::ffff:/, "") ?? "";
  const loopback = address === "::1" || address.startsWith("127.");
  return loopback && FORWARDING_HEADERS.every((name) => req.headers[name] === undefined);
}

/**
 * Deliberately broad: React Router matches routes case-insensitively and also
 * serves trailing-slash and `.data` requests, so any path that mentions
 * agent-signin counts.
 */
export function isAgentSigninPath(url: string | undefined): boolean {
  let path = url ?? "/";
  try {
    path = decodeURIComponent(new URL(path, "http://localhost").pathname);
  } catch {
    // Malformed percent-encoding: match on the raw path.
  }
  return path.toLowerCase().includes("agent-signin");
}
