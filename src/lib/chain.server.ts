import { scoreChain } from "./risk";
import { readEvm } from "./evm.server";
import type { ChainReport, HolderRow, Trade } from "./types";

const RPCS = ["https://solana-rpc.publicnode.com", "https://api.mainnet-beta.solana.com"];

const cache = new Map<string, { at: number; report: ChainReport }>();

type SigInfo = {
  signature: string;
  slot: number;
  blockTime: number | null;
  err: unknown;
};

type Json = Record<string, unknown>;

async function getJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "Mozilla/5.0 (compatible; Ashline/1.0)",
      },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function getPump(mint: string): Promise<Json | null> {
  const url = `https://frontend-api-v3.pump.fun/coins/${mint}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          accept: "application/json",
          "user-agent": "Mozilla/5.0 (compatible; Ashline/1.0)",
        },
        signal: AbortSignal.timeout(12_000),
      });
      if (res.status === 429) {
        await new Promise((resolve) => setTimeout(resolve, 600));
        continue;
      }
      if (!res.ok) return null;
      const body = (await res.json()) as unknown;
      return body && typeof body === "object" ? (body as Json) : null;
    } catch {
      return null;
    }
  }
  return null;
}

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  let last = "RPC unavailable";
  for (const url of RPCS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "Ashline/1.0",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(14_000),
      });
      if (!res.ok) {
        last = `RPC ${res.status}`;
        continue;
      }
      const body = (await res.json()) as { result?: T; error?: { message?: string } };
      if (body.error) {
        last = body.error.message ?? "RPC error";
        continue;
      }
      return body.result as T;
    } catch (error) {
      last = error instanceof Error ? error.message : "RPC error";
    }
  }
  throw new Error(last);
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      out[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return out;
}

function accountMeta(value: unknown): { pubkey: string; signer: boolean } {
  if (typeof value === "string") return { pubkey: value, signer: false };
  if (value && typeof value === "object" && "pubkey" in value) {
    const row = value as { pubkey?: string; signer?: boolean };
    return { pubkey: row.pubkey ?? "", signer: Boolean(row.signer) };
  }
  return { pubkey: "", signer: false };
}

function parseTrade(
  tx: Json | null,
  signature: string,
  mint: string,
  curves: Set<string>,
): Trade | null {
  if (!tx) return null;
  const meta = tx.meta as Json | undefined;
  if (!meta || meta.err) return null;
  const message = (tx.transaction as Json | undefined)?.message as Json | undefined;
  const keys = Array.isArray(message?.accountKeys) ? message.accountKeys.map(accountMeta) : [];
  const balances = (rows: unknown, into: Map<string, number>) => {
    if (!Array.isArray(rows)) return;
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const bal = row as Json;
      if (bal.mint !== mint || typeof bal.owner !== "string") continue;
      const ui = (bal.uiTokenAmount as Json | undefined)?.uiAmount;
      into.set(bal.owner, typeof ui === "number" ? ui : 0);
    }
  };
  const pre = new Map<string, number>();
  const post = new Map<string, number>();
  balances(meta.preTokenBalances, pre);
  balances(meta.postTokenBalances, post);
  const owners = new Set([...pre.keys(), ...post.keys()]);
  let wallet = "";
  let tokenDelta = 0;
  for (const owner of owners) {
    if (curves.has(owner)) continue;
    const delta = (post.get(owner) ?? 0) - (pre.get(owner) ?? 0);
    if (Math.abs(delta) > Math.abs(tokenDelta)) {
      tokenDelta = delta;
      wallet = owner;
    }
  }
  if (!wallet || Math.abs(tokenDelta) < 1) return null;

  const preSol = Array.isArray(meta.preBalances) ? (meta.preBalances as number[]) : [];
  const postSol = Array.isArray(meta.postBalances) ? (meta.postBalances as number[]) : [];
  let curveSol = 0;
  keys.forEach((key, index) => {
    if (!curves.has(key.pubkey)) return;
    const delta = ((postSol[index] ?? 0) - (preSol[index] ?? 0)) / 1e9;
    if (Math.abs(delta) > Math.abs(curveSol)) curveSol = delta;
  });
  let spent = Math.abs(curveSol);
  if (spent < 0.00005 && wallet) {
    const index = keys.findIndex((key) => key.pubkey === wallet);
    if (index >= 0) {
      const walletSol = Math.abs(((postSol[index] ?? 0) - (preSol[index] ?? 0)) / 1e9);
      if (walletSol > spent) spent = walletSol;
    }
  }
  const side: Trade["side"] = tokenDelta > 0 ? "buy" : "sell";
  const time = typeof tx.blockTime === "number" ? tx.blockTime * 1000 : 0;
  return {
    signature,
    time,
    side,
    wallet,
    sol: spent,
    tokens: Math.abs(tokenDelta),
    url: `https://solscan.io/tx/${signature}`,
  };
}

async function loadSignatures(address: string): Promise<SigInfo[]> {
  const all: SigInfo[] = [];
  let before: string | undefined;
  for (let page = 0; page < 3; page++) {
    const config: { limit: number; before?: string } = { limit: 40 };
    if (before) config.before = before;
    const batch = await rpc<SigInfo[]>("getSignaturesForAddress", [address, config]);
    if (!batch?.length) break;
    all.push(...batch);
    if (batch.length < 40) break;
    before = batch[batch.length - 1]?.signature;
  }
  return all;
}

async function loadTrades(
  address: string,
  mint: string,
  curves: Set<string>,
  createdAt: number | null,
): Promise<{ trades: Trade[]; launch: ChainReport["launch"] }> {
  const sigs = await loadSignatures(address);
  const newest = sigs.slice(0, 8).map((row) => row.signature);
  const oldest = sigs.slice(-8).map((row) => row.signature);
  const wanted = [...new Set([...newest, ...oldest])];
  const parsed = await mapPool(wanted, 4, async (signature) => {
    try {
      const tx = await rpc<Json | null>("getTransaction", [
        signature,
        { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
      ]);
      return parseTrade(tx, signature, mint, curves);
    } catch {
      return null;
    }
  });
  const bySig = new Map(parsed.filter((row): row is Trade => Boolean(row)).map((row) => [row.signature, row]));
  const trades = newest.map((signature) => bySig.get(signature)).filter((row): row is Trade => Boolean(row));
  const launchTrades = oldest
    .map((signature) => bySig.get(signature))
    .filter((row): row is Trade => {
      return row != null && row.side === "buy";
    });
  const slotOf = new Map(sigs.map((row) => [row.signature, row.slot]));
  const bySlot = new Map<number, number>();
  for (const trade of launchTrades) {
    const slot = slotOf.get(trade.signature);
    if (slot == null) continue;
    bySlot.set(slot, (bySlot.get(slot) ?? 0) + 1);
  }
  const clusteredBuys = Math.max(0, ...bySlot.values(), 0);
  const oldestTime = sigs.length ? sigs[sigs.length - 1]?.blockTime : null;
  const reachedCreation =
    createdAt != null && oldestTime != null ? oldestTime * 1000 <= createdAt + 180_000 : sigs.length < 120;
  let note = "No clustered buys in the scanned launch window.";
  if (clusteredBuys >= 3) {
    note = `${clusteredBuys} buys landed in the same slot inside the scanned launch window.`;
  } else if (!reachedCreation) {
    note = `Scanned ${sigs.length} signatures and did not reach the creation slot, so a launch bundle can be missed.`;
  }
  return {
    trades,
    launch: {
      scanned: sigs.length,
      reachedCreation,
      clusteredBuys,
      note,
    },
  };
}

function mapRisks(raw: unknown): ChainReport["risks"] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 8).map((row) => {
    if (typeof row === "string") return { name: row, detail: row, level: "warn" };
    const risk = (row ?? {}) as Json;
    return {
      name: str(risk.name) ?? str(risk.title) ?? "Risk",
      detail: str(risk.description) ?? str(risk.message) ?? str(risk.level) ?? "",
      level: str(risk.level) ?? str(risk.severity) ?? "",
    };
  });
}

export async function readChain(mint: string): Promise<ChainReport> {
  if (mint.startsWith("0x")) return readEvm(mint);
  return readSolana(mint);
}

async function readSolana(mint: string): Promise<ChainReport> {
  const hit = cache.get(mint);
  if (hit && Date.now() - hit.at < 90_000) return hit.report;

  const [dexRaw, rugRaw, pump] = await Promise.all([
    getJson(`https://api.dexscreener.com/latest/dex/tokens/${mint}`),
    getJson(`https://api.rugcheck.xyz/v1/tokens/${mint}/report`),
    getPump(mint),
  ]);

  const gaps: string[] = [];
  if (!dexRaw) gaps.push("DexScreener did not respond.");
  if (!rugRaw) gaps.push("Rugcheck did not respond.");
  if (!pump) gaps.push("pump.fun did not respond.");

  const pairs = Array.isArray((dexRaw as Json | null)?.pairs)
    ? ((dexRaw as Json).pairs as Json[])
    : [];
  const pair = [...pairs].sort(
    (a, b) => (num((b.liquidity as Json | undefined)?.usd) ?? 0) - (num((a.liquidity as Json | undefined)?.usd) ?? 0),
  )[0];
  const rug = (rugRaw ?? {}) as Json;
  const token = (rug.token ?? {}) as Json;
  const base = (pair?.baseToken ?? {}) as Json;
  const info = (pair?.info ?? {}) as Json;

  const curve = str(pump?.bonding_curve) ?? str(pair?.pairAddress);
  const associated = str(pump?.associated_bonding_curve);
  const curves = new Set([curve, associated].filter((value): value is string => Boolean(value)));

  const known = (rug.knownAccounts ?? {}) as Record<string, { name?: string; type?: string }>;
  for (const [address, meta] of Object.entries(known)) {
    if (/pump|amm|bonding/i.test(`${meta?.name ?? ""} ${meta?.type ?? ""}`)) curves.add(address);
  }

  const creators: ChainReport["creators"] = [];
  const pumpCreator = str(pump?.creator);
  const rugCreator = str(rug.creator);
  if (pumpCreator) creators.push({ role: "pump.fun creator", address: pumpCreator });
  if (rugCreator && rugCreator !== pumpCreator) creators.push({ role: "rugcheck creator", address: rugCreator });
  const devs = new Set(creators.map((row) => row.address));

  const holderRows: HolderRow[] = (Array.isArray(rug.topHolders) ? rug.topHolders : [])
    .slice(0, 12)
    .map((row) => {
      const holder = row as Json;
      const owner = str(holder.owner) ?? str(holder.address) ?? "";
      const account = str(holder.address);
      const meta = known[owner] ?? (account ? known[account] : undefined);
      const isCurve = curves.has(owner) || (account != null && curves.has(account));
      const isDev = devs.has(owner);
      return {
        owner,
        pct: num(holder.pct) ?? 0,
        amount: num(holder.uiAmount) ?? 0,
        label: meta?.name ?? (isCurve ? "Bonding curve" : isDev ? "Creator" : null),
        insider: Boolean(holder.insider),
        isCurve,
        isDev,
      };
    })
    .filter((row) => row.owner);

  const curvePct = holderRows.filter((row) => row.isCurve).reduce((sum, row) => sum + row.pct, 0);
  const outside = holderRows.filter((row) => !row.isCurve);
  const topWalletExCurvePct = outside.length ? Math.max(...outside.map((row) => row.pct)) : null;
  const top10ExCurvePct = outside.slice(0, 10).reduce((sum, row) => sum + row.pct, 0);
  const devHeldPct = holderRows.filter((row) => row.isDev).reduce((sum, row) => sum + row.pct, 0);

  const websites = (Array.isArray(info.websites) ? info.websites : [])
    .map((row) => {
      const site = row as Json;
      const url = str(site.url);
      return url ? { url, label: str(site.label) ?? "Website" } : null;
    })
    .filter((row): row is { url: string; label: string } => Boolean(row));
  const pumpSite = str(pump?.website);
  if (pumpSite && !websites.some((row) => row.url === pumpSite)) {
    websites.unshift({ url: pumpSite, label: "Website" });
  }
  const socials = (Array.isArray(info.socials) ? info.socials : [])
    .map((row) => {
      const social = row as Json;
      const url = str(social.url);
      return url ? { url, type: str(social.type) ?? "social" } : null;
    })
    .filter((row): row is { url: string; type: string } => Boolean(row));

  const createdAt = num(pump?.created_timestamp) ?? num(pair?.pairCreatedAt);
  const dexUrl = str(pair?.url) ?? `https://dexscreener.com/solana/${mint}`;
  const pumpUrl = `https://pump.fun/coin/${mint}`;
  const solscanUrl = `https://solscan.io/token/${mint}`;
  const rugcheckUrl = `https://rugcheck.xyz/tokens/${mint}`;

  let trades: Trade[] = [];
  let launch: ChainReport["launch"] = null;
  if (curve) {
    try {
      const tape = await loadTrades(curve, mint, curves, createdAt);
      trades = tape.trades;
      launch = tape.launch;
    } catch {
      gaps.push("Recent trades could not be read from Solana RPC.");
    }
  } else {
    gaps.push("No pool address, so the trade tape was not read.");
  }

  const lastTrade = trades[0] ?? null;
  const lastBuy = trades.find((trade) => trade.side === "buy") ?? null;
  const txns = (pair?.txns as Json | undefined)?.h24 as Json | undefined;
  const pumpComplete = typeof pump?.complete === "boolean" ? pump.complete : null;
  const solInCurve = num(pump?.real_sol_reserves) != null ? (num(pump?.real_sol_reserves) as number) / 1e9 : null;
  const onBondingCurve =
    pumpComplete === false && (solInCurve ?? 0) > 0.01
      ? true
      : pumpComplete === true
        ? false
        : pair?.dexId === "pumpfun"
          ? true
          : null;

  if (!pair && !pump && !rugRaw) {
    throw new Error("No chain source returned this mint. Check the address and try again.");
  }

  const report: ChainReport = {
    mint,
    chainId: "solana",
    chainLabel: "Solana",
    name: str(pump?.name) ?? str(base.name) ?? str((rug.tokenMeta as Json | undefined)?.name) ?? "Unknown token",
    symbol: str(pump?.symbol) ?? str(base.symbol) ?? str((rug.tokenMeta as Json | undefined)?.symbol) ?? "—",
    image: str(info.imageUrl) ?? str(pump?.image_uri),
    description: str(pump?.description) ?? str((rug.fileMeta as Json | undefined)?.description) ?? "",
    createdAt,
    priceUsd: num(pair?.priceUsd),
    marketCapUsd: num(pair?.marketCap) ?? num(pair?.fdv),
    liquidityUsd: num((pair?.liquidity as Json | undefined)?.usd) ?? num(rug.totalMarketLiquidity),
    volume24hUsd: num((pair?.volume as Json | undefined)?.h24),
    buys24h: num(txns?.buys),
    sells24h: num(txns?.sells),
    holders: num(rug.totalHolders),
    onBondingCurve,
    solInCurve,
    athMarketCapUsd: num(pump?.ath_market_cap),
    mintAuthority: str(token.mintAuthority) ?? str(rug.mintAuthority),
    freezeAuthority: str(token.freezeAuthority) ?? str(rug.freezeAuthority),
    risks: mapRisks(rug.risks),
    websites,
    socials,
    pumpUrl,
    solscanUrl,
    dexUrl,
    rugcheckUrl,
    explorerUrl: solscanUrl,
    explorerLabel: "Solscan",
    creators,
    priorLaunches: [],
    risk: { score: 0, band: "watch", points: [] },
    holderRows,
    curvePct: holderRows.length ? curvePct : null,
    topWalletExCurvePct,
    top10ExCurvePct: outside.length ? top10ExCurvePct : null,
    devHeldPct: creators.length ? devHeldPct : null,
    trades,
    lastBuy,
    lastTrade,
    launch,
    gaps,
    sources: [
      { label: "pump.fun", url: pumpUrl },
      { label: "DexScreener", url: dexUrl },
      { label: "Rugcheck", url: rugcheckUrl },
      { label: "Solscan", url: solscanUrl },
    ],
  };
  report.gaps.push("Earlier launches by this deployer are not in the chain index. The agent has to search the wallet.");
  report.risk = scoreChain(report);

  cache.set(mint, { at: Date.now(), report });
  return report;
}
