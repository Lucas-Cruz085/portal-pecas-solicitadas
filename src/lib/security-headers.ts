export function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (!headers.has("content-security-policy")) {
    const dev = process.env["NODE_ENV"] !== "production";
    let supabaseOrigin = "";
    try {
      if (process.env["SUPABASE_URL"]) supabaseOrigin = new URL(process.env["SUPABASE_URL"]).origin;
    } catch {
      supabaseOrigin = "";
    }
    const connect = ["'self'", supabaseOrigin, "https://*.supabase.co", "wss://*.supabase.co"]
      .filter(Boolean)
      .join(" ");
    const scriptSrc = dev ? "'self' 'unsafe-inline' 'unsafe-eval' blob:" : "'self' 'unsafe-inline' blob:";
    const connectSrc = dev ? `${connect} ws: wss: http://localhost:* http://127.0.0.1:*` : connect;
    headers.set(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "form-action 'self'",
        `script-src ${scriptSrc}`,
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com data:",
        "img-src 'self' data: blob:",
        `connect-src ${connectSrc}`,
        "worker-src 'self' blob:",
        "frame-src 'self'",
      ].join("; "),
    );
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
