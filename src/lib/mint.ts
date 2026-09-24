export function extractMint(raw: string): string | null {
  const text = raw
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, "")
    .replace(/\s+/g, "")
    .trim();
  if (!text) return null;
  const labeled = text.match(
    /(?:coin|token|address|account|mint)\/([1-9A-HJ-NP-Za-km-z]{32,44})/i,
  );
  if (labeled?.[1]) return labeled[1];
  const all = text.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/g);
  if (!all?.length) return null;
  return all.sort((a, b) => b.length - a.length)[0] ?? null;
}

export function mintGroups(mint: string): string[] {
  return mint.match(/.{1,4}/g) ?? [mint];
}

export function shortAddr(value: string): string {
  if (value.length < 12) return value;
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export function compactNum(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(2)}K`;
  if (abs >= 1) return `${sign}${abs.toFixed(2)}`;
  if (abs === 0) return "0";
  return `${sign}${abs.toPrecision(2)}`;
}

export function usd(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toPrecision(2)}`;
}

export function sol(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1) return `${n.toFixed(3)} SOL`;
  if (n >= 0.0001) return `${n.toFixed(4)} SOL`;
  if (n > 0) return `${n.toPrecision(2)} SOL`;
  return "0 SOL";
}

export function ago(ms: number | null): string {
  if (ms == null) return "—";
  const seconds = Math.max(0, (Date.now() - ms) / 1000);
  if (seconds < 60) return `${Math.floor(seconds)}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function safeHref(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}
