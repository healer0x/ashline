import { usd } from "./mint";
import type { ChainReport, RiskScore } from "./types";

export function scoreChain(chain: ChainReport): RiskScore {
  const points: RiskScore["points"] = [];
  const holderSource = chain.chainId === "solana" ? chain.rugcheckUrl : chain.explorerUrl;
  const holderLabel = chain.chainId === "solana" ? "Rugcheck" : chain.explorerLabel;

  if ((chain.topWalletExCurvePct ?? 0) >= 15) {
    points.push({
      points: 20,
      text: `Largest wallet outside the pool holds ${chain.topWalletExCurvePct?.toFixed(2)}%.`,
      sourceUrl: holderSource,
      sourceLabel: holderLabel,
    });
  }
  if ((chain.top10ExCurvePct ?? 0) >= 40) {
    points.push({
      points: 15,
      text: `Top wallets outside the pool hold ${chain.top10ExCurvePct?.toFixed(2)}% combined.`,
      sourceUrl: holderSource,
      sourceLabel: holderLabel,
    });
  }
  if (chain.mintAuthority) {
    points.push({
      points: 20,
      text: "A mint or owner authority is still set.",
      sourceUrl: holderSource,
      sourceLabel: holderLabel,
    });
  }
  if (chain.freezeAuthority) {
    points.push({
      points: 15,
      text: "Freeze authority is still set.",
      sourceUrl: chain.explorerUrl,
      sourceLabel: chain.explorerLabel,
    });
  }
  const liquidity = chain.liquidityUsd ?? 0;
  const cap = chain.marketCapUsd ?? 0;
  if (liquidity > 0 && liquidity < 8_000) {
    points.push({
      points: 15,
      text: `Liquidity is ${usd(liquidity)}.`,
      sourceUrl: chain.dexUrl,
      sourceLabel: "DexScreener",
    });
  } else if (cap > 20_000 && liquidity > 0 && liquidity / cap < 0.08) {
    points.push({
      points: 12,
      text: `Liquidity is ${usd(liquidity)} against a ${usd(cap)} cap.`,
      sourceUrl: chain.dexUrl,
      sourceLabel: "DexScreener",
    });
  }
  if ((chain.launch?.clusteredBuys ?? 0) >= 3) {
    points.push({
      points: 15,
      text: chain.launch?.note || "Several buys landed in the same launch slots.",
      sourceUrl: chain.explorerUrl,
      sourceLabel: chain.explorerLabel,
    });
  }
  if (chain.onBondingCurve === true) {
    points.push({
      points: 8,
      text: "Liquidity is still a bonding curve, not a locked pool.",
      sourceUrl: chain.pumpUrl,
      sourceLabel: "pump.fun",
    });
  }
  const sharp = chain.risks.find((risk) => /honey|mintable|unlocked|scam/i.test(`${risk.name} ${risk.detail}`));
  if (sharp) {
    points.push({
      points: 18,
      text: `${sharp.name}. ${sharp.detail}`.trim(),
      sourceUrl: chain.explorerUrl,
      sourceLabel: chain.explorerLabel,
    });
  }
  if (!points.length) {
    points.push({
      points: 12,
      text: "No concentration, authority, or thin-liquidity flag was in the sources read. Unread facts can still matter.",
      sourceUrl: chain.dexUrl,
      sourceLabel: "DexScreener",
    });
  }
  const score = Math.min(95, points.reduce((sum, point) => sum + point.points, 0));
  const band = score >= 55 ? "elevated" : score >= 30 ? "watch" : "lower";
  return { score, band, points };
}
