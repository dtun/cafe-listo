/**
 * Public origin of this server. TLS terminates at the hosting proxy, so the
 * request URL says http:// — trust X-Forwarded-* first. An explicit override wins.
 */
export function publicBaseUrl(req: Request, override?: string): string {
  if (override) return override.replace(/\/+$/, "");
  const url = new URL(req.url);
  const proto =
    req.headers.get("X-Forwarded-Proto")?.split(",")[0].trim() ||
    url.protocol.replace(":", "");
  const host =
    req.headers.get("X-Forwarded-Host")?.split(",")[0].trim() || url.host;
  return `${proto}://${host}`;
}

export function protectedResourceMetadataUrl(baseUrl: string): string {
  return `${baseUrl}/.well-known/oauth-protected-resource/mcp`;
}
