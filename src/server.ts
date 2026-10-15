import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { withSecurityHeaders } from "./lib/security-headers";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

function applyWorkerEnv(env: unknown) {
  if (!env || typeof env !== "object") return;
  const target = process.env as Record<string, string | undefined>;
  for (const [key, value] of Object.entries(env as Record<string, unknown>)) {
    if (typeof value === "string" && !target[key]) target[key] = value;
  }
}

function publicSupabaseConfig() {
  const url = process.env["SUPABASE_URL"] || process.env["VITE_SUPABASE_URL"] || "";
  const key =
    process.env["SUPABASE_PUBLISHABLE_KEY"] || process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] || "";
  return { url, key };
}

async function injectPublicSupabaseConfig(response: Response): Promise<Response> {
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("text/html")) return response;
  const { url, key } = publicSupabaseConfig();
  if (!url || !key) return response;
  const html = await response.text();
  if (html.includes("__SUPABASE_PUBLIC__")) {
    return new Response(html, response);
  }
  const payload = JSON.stringify({ url, key }).replace(/</g, "\\u003c");
  const tag = "<script>window.__SUPABASE_PUBLIC__=" + payload + "</script>";
  const next = html.includes("</head>") ? html.replace("</head>", tag + "</head>") : tag + html;
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(next, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      applyWorkerEnv(env);
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return injectPublicSupabaseConfig(
        withSecurityHeaders(await normalizeCatastrophicSsrResponse(response)),
      );
    } catch (error) {
      console.error(error);
      return withSecurityHeaders(
        new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      );
    }
  },
};
