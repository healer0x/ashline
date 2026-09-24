# Ashline

A Grok research desk for Solana memecoins. Paste a contract address. Ashline shows the holders and the last buy, then Grok reads the timeline, the chain, and the web. You get a sourced report with red flags and receipts. Not a buy signal.

## What it does

1. You paste a Solana mint, a pump.fun link, or a Solscan token URL.
2. The desk reads public chain data immediately: identity, holders, liquidity, the last buy, and the recent tape.
3. **Read both sides** asks Grok to call onchain tools, then X Search and Web Search, and file a dossier.
4. The dossier compares hype to holder spread, liquidity, authorities, and launch clusters. It does not say buy, sell, or name a price target.

Solana is the chain for this build. The Grokathon brief says you may build on any chain. Ashline is the Solana one, because the trail it reads (pump.fun, bonding-curve tape, holder spread) lives there. An Ethereum `0x` address is not a Solana mint and will not lock.

## Run it

```bash
cp .env.example .env
# put your xAI key in .env
npm install
npm run dev
```

Open the local dev server and paste a mint. `GXTCD25QkWM7DJ6JcmNxeCKggSgh22iXKMNxPE12DkCc` is the $GROKATHON sample.

## Grok

- Model: `grok-4.5` through the xAI Responses API
- Server tools: `x_search`, `web_search`
- Function tools the model chooses: `inspect_identity`, `inspect_holders`, `inspect_trades`, `inspect_liquidity`, then `file_dossier`
- The key stays in `XAI_API_KEY`. It is not in this repo.

## Onchain sources

All read-only:

- DexScreener token API, for the pool, price, liquidity, and volume
- Rugcheck public report, for holders, risks, and authorities
- pump.fun public coin API, when the mint is on that curve
- Solana JSON-RPC (`getSignaturesForAddress`, `getTransaction`), for the trade tape, last buy, and launch-slot clusters

## Not advice

Research only. The agent does not trade, sign, or hold funds. Every report is not financial advice.
