export type Trade = {
  signature: string;
  time: number;
  side: "buy" | "sell" | "other";
  wallet: string;
  sol: number;
  tokens: number;
  url: string;
  display?: string;
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

export type PriorLaunch = {
  name: string;
  symbol: string;
  mint: string;
  chainLabel: string;
  url: string;
  note: string;
};

export type RiskPoint = {
  points: number;
  text: string;
  sourceUrl: string;
  sourceLabel: string;
};

export type RiskScore = {
  score: number;
  band: "lower" | "watch" | "elevated";
  points: RiskPoint[];
};

export type ChainReport = {
  mint: string;
  chainId: string;
  chainLabel: string;
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
  explorerUrl: string;
  explorerLabel: string;
  creators: { role: string; address: string }[];
  priorLaunches: PriorLaunch[];
  risk: RiskScore;
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

export type Mismatch = {
  title: string;
  hype: string;
  chainFact: string;
  sourceUrl: string;
};

export type EarlierLaunch = {
  name: string;
  outcome: string;
  sourceUrl: string;
};

export type Dossier = {
  headline: string;
  timeline: string;
  chain: string;
  web: string;
  flags: Flag[];
  claims: Claim[];
  mismatches: Mismatch[];
  devWallet: string;
  devHandle: string;
  devNote: string;
  earlier: EarlierLaunch[];
  reply: string;
  chainOnly?: boolean;
};

export type ResearchEvent =
  | { type: "status"; text: string }
  | { type: "chain"; chain: ChainReport }
  | { type: "trace"; item: TraceItem }
  | { type: "dossier"; dossier: Dossier }
  | { type: "citations"; urls: string[] }
  | { type: "error"; message: string }
  | { type: "done" };

export type TapeRow = {
  mint: string;
  chainId: string;
  chainLabel: string;
  name: string;
  symbol: string;
  url: string;
  liquidityUsd: number | null;
  marketCapUsd: number | null;
  createdAt: number | null;
  flags: string[];
};
