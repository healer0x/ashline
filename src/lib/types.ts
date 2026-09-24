export type Trade = {
  signature: string;
  time: number;
  side: "buy" | "sell" | "other";
  wallet: string;
  sol: number;
  tokens: number;
  url: string;
};

export type HolderRow = {
  owner: string;
  pct: number;
  amount: number;
  label: string | null;
  insider: boolean;
  isCurve: boolean;
  isDev: boolean;
};

export type ChainReport = {
  mint: string;
  name: string;
  symbol: string;
  image: string | null;
  description: string;
  createdAt: number | null;
  priceUsd: number | null;
  marketCapUsd: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  buys24h: number | null;
  sells24h: number | null;
  holders: number | null;
  onBondingCurve: boolean | null;
  solInCurve: number | null;
  athMarketCapUsd: number | null;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  risks: { name: string; detail: string; level: string }[];
  websites: { url: string; label: string }[];
  socials: { url: string; type: string }[];
  pumpUrl: string;
  solscanUrl: string;
  dexUrl: string;
  rugcheckUrl: string;
  creators: { role: string; address: string }[];
  holderRows: HolderRow[];
  curvePct: number | null;
  topWalletExCurvePct: number | null;
  top10ExCurvePct: number | null;
  devHeldPct: number | null;
  trades: Trade[];
  lastBuy: Trade | null;
  lastTrade: Trade | null;
  launch: {
    scanned: number;
    reachedCreation: boolean;
    clusteredBuys: number;
    note: string;
  } | null;
  gaps: string[];
  sources: { label: string; url: string }[];
};

export type TraceItem = {
  id: string;
  tool: string;
  state: "running" | "done" | "refused";
  detail: string;
};

export type Flag = {
  level: "clear" | "watch" | "elevated";
  title: string;
  detail: string;
  sourceUrl: string;
};

export type Claim = {
  text: string;
  sourceUrl: string;
  sourceLabel: string;
};

export type Dossier = {
  headline: string;
  timeline: string;
  chain: string;
  web: string;
  flags: Flag[];
  claims: Claim[];
};

export type ResearchEvent =
  | { type: "status"; text: string }
  | { type: "chain"; chain: ChainReport }
  | { type: "trace"; item: TraceItem }
  | { type: "dossier"; dossier: Dossier }
  | { type: "citations"; urls: string[] }
  | { type: "error"; message: string }
  | { type: "done" };
