import { createClient } from "@supabase/supabase-js";

function retiredPasswords() {
  return (process.env["RETIRED_PASSWORDS"] ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

export function isRetiredPassword(password: string) {
  return retiredPasswords().includes(password);
}

export function generateTemporaryPassword() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let out = "Nmq-";
  for (const byte of bytes) out += ALPHABET[byte % ALPHABET.length];
  return out;
}

export function createEphemeralAuth() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Falha ao entrar. Tente novamente.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function revokeUserSessions(userId: string) {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) return;
  try {
    const response = await fetch(`${url}/auth/v1/admin/users/${userId}/logout`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        apikey: key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ scope: "global" }),
    });
    if (!response.ok) console.error("[auth] revoke sessions", response.status);
  } catch (error) {
    console.error("[auth] revoke sessions", error);
  }
}
