const pad = (n: number) => String(n).padStart(2, "0");

export function localISO(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseDate(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR").format(parseDate(value));
}

export function money(value: number | string | null | undefined) {
  const n = typeof value === "string" ? Number(value) : value ?? 0;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

export function nights(checkIn: string, checkOut: string) {
  const diff = parseDate(checkOut).getTime() - parseDate(checkIn).getTime();
  return Math.max(0, Math.round(diff / 86400000));
}

export function monthKey(value: string) {
  return value.slice(0, 7);
}

export function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
