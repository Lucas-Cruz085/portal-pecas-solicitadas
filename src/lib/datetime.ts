export const TZ = "America/Sao_Paulo";

const dt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const d = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return "—";
  return dt.format(new Date(value));
}
export function formatDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  return d.format(new Date(value));
}

/** "YYYY-MM-DD" in Brasília today */
export function todayISO() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
  return parts; // en-CA yields YYYY-MM-DD
}

/** Start/end of a Brasília calendar day as UTC ISO strings (Brazil has no DST: fixed -03:00). */
export function startOfDayBR(date: string) {
  return new Date(`${date}T00:00:00-03:00`).toISOString();
}
export function endOfDayBR(date: string) {
  return new Date(`${date}T23:59:59.999-03:00`).toISOString();
}

export function formatQty(n: number | string | null | undefined) {
  if (n === null || n === undefined) return "—";
  const v = typeof n === "string" ? Number(n) : n;
  return Number.isInteger(v) ? String(v) : v.toLocaleString("pt-BR");
}
