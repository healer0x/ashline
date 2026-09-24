import { usd } from "./mint";
import type { TapeRow } from "./types";

type Json = Record<string, unknown>;

const LABELS: Record<string, string> = {
  solana: "Solana",
  ethereum: "Ethereum",
  base: "Base",
  bsc: "BNB Chain",
  polygon: "Polygon",
  arbitrum: "Arbitrum",
  optimism: "Optimism",
  avalanche: "Avalanche",
};

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "Ashline/1.0" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) return null;
  return res.json();
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function flagsFor(row: { liquidityUsd: number | null; marketCapUsd: number | null; createdAt: number | null; chainId: string; onCurve: boolean }): string[] {
  const flags: string[] = [];
  const age = row.createdAt ? Date.now() - row.createdAt : null;
  if (age != null && age >= 0 && age < 45 * 60 * 1000) flags.push("Fresh launch");
  if ((row.liquidityUsd ?? 0) > 0 && (row.liquidityUsd ?? 0) < 8_000) flags.push("Thin liquidity");
  if ((row.marketCapUsd ?? 0) > 20_000 && (row.liquidityUsd ?? 0) > 0 && (row.liquidityUsd as number) / (row.marketCapUsd as number) < 0.08) {
    flags.push("Liquidity thin versus cap");
  }
  if (row.onCurve) flags.push("Curve liquidity is not a locked pool");
  if (!flags.length) flags.push("No cheap pattern on this scan");
  return flags;
}

export async function readTape(): Promise<TapeRow[]> {
  const [profilesRaw, pumpRaw] = await Promise.all([
    getJson("https://api.dexscreener.com/token-profiles/latest/v1").catch(() => null),
    getJson("https://frontend-api-v3.pump.fun/coins?offset=0&limit=8&sort=created_timestamp&order=DESC&includeNsfw=false").catch(() => null),
  ]);

  const rows: TapeRow[] = [];
  if (Array.isArray(pumpRaw)) {
    for (const coin of pumpRaw.slice(0, 8) as Json[]) {
      const mint = typeof coin.mint === "string" ? coin.mint : "";
      if (!mint) continue;
      const marketCap = num(coin.usd_market_cap);
      const createdAt = num(coin.created_timestamp);
      rows.push({
        mint,
        chainId: "solana",
        chainLabel: "Solana",
        name: typeof coin.name === "string" ? coin.name : "New coin",
        symbol: typeof coin.symbol === "string" ? coin.symbol : "—",
        url: `https://pump.fun/coin/${mint}`,
        liquidityUsd: null,
        marketCapUsd: marketCap,
        createdAt,
        flags: flagsFor({
          liquidityUsd: null,
          marketCapUsd: marketCap,
          createdAt,
          chainId: "solana",
          onCurve: coin.complete === false,
        }),
      });
    }
  }

  const profiles = Array.isArray(profilesRaw) ? (profilesRaw as Json[]) : [];
  const grouped = new Map<string, string[]>();
  for (const profile of profiles) {
    const chainId = typeof profile.chainId === "string" ? profile.chainId : "";
    const token = typeof profile.tokenAddress === "string" ? profile.tokenAddress : "";
    if (!chainId || !token || rows.some((row) => row.mint === token)) continue;
    const list = grouped.get(chainId) ?? [];
    if (list.length < 8) list.push(token);
    grouped.set(chainId, list);
  }

  const batches = [...grouped.entries()].slice(0, 4);
  const pairGroups = await Promise.all(
    batches.map(async ([chainId, addresses]) => {
      try {
        const body = await getJson(`https://api.dexscreener.com/tokens/v1/${chainId}/${addresses.join(",")}`);
        return Array.isArray(body) ? (body as Json[]) : [];
      } catch {
        return [];
      }
    }),
  );

  const seen = new Set(rows.map((row) => row.mint));
  for (const pair of pairGroups.flat()) {
    const base = (pair.baseToken ?? {}) as Json;
    const mint = typeof base.address === "string" ? base.address : "";
    const chainId = typeof pair.chainId === "string" ? pair.chainId : "";
    if (!mint || !chainId || seen.has(mint)) continue;
    seen.add(mint);
    const liquidityUsd = num((pair.liquidity as Json | undefined)?.usd);
    const marketCapUsd = num(pair.marketCap) ?? num(pair.fdv);
    const createdAt = num(pair.pairCreatedAt);
    rows.push({
      mint,
      chainId,
      chainLabel: LABELS[chainId] ?? chainId,
      name: typeof base.name === "string" ? base.name : "Token",
      symbol: typeof base.symbol === "string" ? base.symbol : "—",
      url: typeof pair.url === "string" ? pair.url : `https://dexscreener.com/${chainId}/${mint}`,
      liquidityUsd,
      marketCapUsd,
      createdAt,
      flags: flagsFor({ liquidityUsd, marketCapUsd, createdAt, chainId, onCurve: pair.dexId === "pumpfun" }),
    });
    if (rows.length >= 16) break;
  }

  if (!rows.length) throw new Error("The launch tape did not respond.");
  return rows;
}

export function tapeCaption(row: TapeRow): string {
  const bits = [usd(row.marketCapUsd)];
  if (row.liquidityUsd != null) bits.push(`${usd(row.liquidityUsd)} liquidity`);
  return bits.join(" · ");
}
