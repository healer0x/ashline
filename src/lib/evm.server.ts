import { usd, walletUrl } from "./mint";
import { scoreChain } from "./risk";
import type { ChainReport, Trade } from "./types";

type Json = Record<string, unknown>;

const GOPLUS: Record<string, string> = {
  ethereum: "1",
  base: "8453",
  bsc: "56",
  polygon: "137",
  arbitrum: "42161",
  optimism: "10",
  avalanche: "43114",
};

const GECKO: Record<string, string> = {
  ethereum: "eth",
  base: "base",
  bsc: "bsc",
  polygon: "polygon_pos",
  arbitrum: "arbitrum",
  optimism: "optimism",
  avalanche: "avax",
};

const EXPLORER: Record<string, { label: string; tx: string }> = {
  ethereum: { label: "Etherscan", tx: "https://etherscan.io/tx/" },
  base: { label: "Basescan", tx: "https://basescan.org/tx/" },
  bsc: { label: "BscScan", tx: "https://bscscan.com/tx/" },
  polygon: { label: "Polygonscan", tx: "https://polygonscan.com/tx/" },
  arbitrum: { label: "Arbiscan", tx: "https://arbiscan.io/tx/" },
  optimism: { label: "Optimistic Etherscan", tx: "https://optimistic.etherscan.io/tx/" },
  avalanche: { label: "Snowtrace", tx: "https://snowtrace.io/tx/" },
};

const cache = new Map<string, { at: number; report: ChainReport }>();

async function getJson(url: string): Promise<Json | null> {
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json", "user-agent": "Ashline/1.0" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as unknown;
    return body && typeof body === "object" ? (body as Json) : null;
  } catch {
    return null;
  }
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function chainLabel(chainId: string): string {
  if (chainId === "bsc") return "BNB Chain";
  return chainId.slice(0, 1).toUpperCase() + chainId.slice(1);
}

export async function readEvm(mint: string): Promise<ChainReport> {
  const key = mint.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 90_000) return hit.report;

  const dexRaw = await getJson(`https://api.dexscreener.com/latest/dex/tokens/${key}`);
  const pairs = Array.isArray(dexRaw?.pairs) ? (dexRaw.pairs as Json[]) : [];
  const pair = [...pairs].sort(
    (a, b) => (num((b.liquidity as Json | undefined)?.usd) ?? 0) - (num((a.liquidity as Json | undefined)?.usd) ?? 0),
  )[0];
  if (!pair) throw new Error("No DexScreener pool for that contract. Check the chain and the address.");

  const chainId = str(pair.chainId) ?? "ethereum";
  const base = (pair.baseToken ?? {}) as Json;
  const info = (pair.info ?? {}) as Json;
  const gaps: string[] = [];
  const goplusId = GOPLUS[chainId];
  const securityRaw = goplusId
    ? await getJson(`https://api.gopluslabs.io/api/v1/token_security/${goplusId}?contract_addresses=${key}`)
    : null;
  const securityMap = (securityRaw?.result ?? {}) as Record<string, Json>;
  const security = securityMap[key] ?? Object.values(securityMap)[0] ?? null;
  if (!security) gaps.push(goplusId ? "GoPlus did not return a security report." : `No GoPlus chain map for ${chainId}.`);

  const holders = Array.isArray(security?.holders) ? (security.holders as Json[]) : [];
  const holderRows = holders.slice(0, 12).map((row) => {
    const owner = str(row.address) ?? "";
    const pct = (num(row.percent) ?? 0) * 100;
    const tag = str(row.tag);
    return {
      owner,
      pct,
      amount: num(row.balance) ?? 0,
      label: tag,
      insider: false,
      isCurve: false,
      isDev: false,
    };
  }).filter((row) => row.owner);
  const topWalletExCurvePct = holderRows.length ? Math.max(...holderRows.map((row) => row.pct)) : null;
  const top10ExCurvePct = holderRows.length ? holderRows.slice(0, 10).reduce((sum, row) => sum + row.pct, 0) : null;

  const creator = str(security?.creator_address);
  const owner = str(security?.owner_address);
  const ownerSet = owner && !/^0x0+$/.test(owner) ? owner : null;
  const creators: ChainReport["creators"] = [];
  if (creator) creators.push({ role: "Deployer", address: creator });
  if (ownerSet && ownerSet.toLowerCase() !== creator?.toLowerCase()) creators.push({ role: "Owner", address: ownerSet });
  holderRows.forEach((row) => {
    row.isDev = creators.some((item) => item.address.toLowerCase() === row.owner.toLowerCase());
    if (row.isDev && !row.label) row.label = "Deployer";
  });

  const risks: ChainReport["risks"] = [];
  if (security?.is_honeypot === "1") risks.push({ name: "Honeypot flag", detail: "GoPlus marked this contract as a honeypot.", level: "elevated" });
  if (security?.is_mintable === "1") risks.push({ name: "Mintable", detail: "GoPlus says the contract can still mint.", level: "watch" });
  const lp = Array.isArray(security?.lp_holders) ? (security.lp_holders as Json[]) : [];
  const locked = lp.some((row) => row.is_locked === 1 || row.is_locked === "1");
  if (lp.length && !locked) risks.push({ name: "Unlocked liquidity", detail: "GoPlus did not mark the LP holders as locked.", level: "watch" });

  const websites = (Array.isArray(info.websites) ? info.websites : [])
    .map((row) => {
      const site = row as Json;
      const url = str(site.url);
      return url ? { url, label: str(site.label) ?? "Website" } : null;
    })
    .filter((row): row is { url: string; label: string } => Boolean(row));
  const socials = (Array.isArray(info.socials) ? info.socials : [])
    .map((row) => {
      const social = row as Json;
      const url = str(social.url);
      return url ? { url, type: str(social.type) ?? "social" } : null;
    })
    .filter((row): row is { url: string; type: string } => Boolean(row));

  const explorer = EXPLORER[chainId] ?? { label: "Explorer", tx: "" };
  const dexUrl = str(pair.url) ?? `https://dexscreener.com/${chainId}/${key}`;
  const explorerUrl = walletUrl(chainId, key).replace("/address/", "/token/").replace("/account/", "/token/");
  const txns = (pair.txns as Json | undefined)?.h24 as Json | undefined;
  const trades = await readTrades(chainId, str(pair.pairAddress), key, explorer.tx);
  if (!trades.length) gaps.push("Recent trades were not on the pool feed.");

  const report: ChainReport = {
    mint: key,
    chainId,
    chainLabel: chainLabel(chainId),
    name: str(security?.token_name) ?? str(base.name) ?? "Unknown token",
    symbol: str(security?.token_symbol) ?? str(base.symbol) ?? "—",
    image: str(info.imageUrl),
    description: "",
    createdAt: num(pair.pairCreatedAt),
    priceUsd: num(pair.priceUsd),
    marketCapUsd: num(pair.marketCap) ?? num(pair.fdv),
    liquidityUsd: num((pair.liquidity as Json | undefined)?.usd),
    volume24hUsd: num((pair.volume as Json | undefined)?.h24),
    buys24h: num(txns?.buys),
    sells24h: num(txns?.sells),
    holders: num(security?.holder_count),
    onBondingCurve: null,
    solInCurve: null,
    athMarketCapUsd: null,
    mintAuthority: security?.is_mintable === "1" ? ownerSet ?? "mintable" : ownerSet,
    freezeAuthority: null,
    risks,
    websites,
    socials,
    pumpUrl: dexUrl,
    solscanUrl: explorerUrl,
    dexUrl,
    rugcheckUrl: dexUrl,
    explorerUrl,
    explorerLabel: explorer.label,
    creators,
    priorLaunches: [],
    risk: { score: 0, band: "watch", points: [] },
    holderRows,
    curvePct: null,
    topWalletExCurvePct,
    top10ExCurvePct,
    devHeldPct: holderRows.filter((row) => row.isDev).reduce((sum, row) => sum + row.pct, 0) || null,
    trades,
    lastBuy: trades.find((trade) => trade.side === "buy") ?? null,
    lastTrade: trades[0] ?? null,
    launch: null,
    gaps: [
      ...gaps,
      "Earlier launches by this deployer are not in the chain index. The agent has to search the wallet.",
    ],
    sources: [
      { label: "DexScreener", url: dexUrl },
      { label: explorer.label, url: explorerUrl },
      ...(goplusId ? [{ label: "GoPlus", url: `https://api.gopluslabs.io/api/v1/token_security/${goplusId}?contract_addresses=${key}` }] : []),
    ],
  };
  report.risk = scoreChain(report);
  cache.set(key, { at: Date.now(), report });
  return report;
}

async function readTrades(chainId: string, pool: string | null, mint: string, txBase: string): Promise<Trade[]> {
  const network = GECKO[chainId];
  if (!network || !pool) return [];
  const raw = await getJson(`https://api.geckoterminal.com/api/v2/networks/${network}/pools/${pool}/trades`);
  const rows = Array.isArray(raw?.data) ? (raw.data as Json[]) : [];
  return rows.slice(0, 8).map((row) => {
    const trade = (row.attributes ?? {}) as Json;
    const from = (str(trade.from_token_address) ?? "").toLowerCase();
    const to = (str(trade.to_token_address) ?? "").toLowerCase();
    const side: Trade["side"] = to === mint ? "buy" : from === mint ? "sell" : "other";
    const hash = str(trade.tx_hash) ?? "";
    const volume = num(trade.volume_in_usd) ?? 0;
    const tokens = num(side === "sell" ? trade.from_token_amount : trade.to_token_amount) ?? 0;
    const wallet = str(trade.tx_from_address) ?? "";
    return {
      signature: hash,
      time: Date.parse(str(trade.block_timestamp) ?? "") || 0,
      side,
      wallet,
      sol: volume,
      tokens: Math.abs(tokens),
      url: hash && txBase ? `${txBase}${hash}` : `https://dexscreener.com/${chainId}/${mint}`,
      display: usd(volume),
    };
  }).filter((trade) => trade.signature);
}
