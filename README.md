# Ashline

A Grok research desk for memecoins on any chain DexScreener lists. Paste a Solana mint or a `0x` contract. Ashline scores the sourced flags, shows holders and the last buy, then Grok reads the timeline against the chain. Not a buy signal.

## Tracks

- **Report.** One page: risk flags with a receipt on every point, holders, last buy, and the filed dossier.
- **Timeline vs chain.** The dossier splits what X is saying from what the chain shows, and marks the mismatches.
- **Dev dossier.** The deployer or owner wallet, any X handle Grok can source, and earlier launches only when a page backs them.
- **Tape.** A scan of fresh pump.fun coins and the latest DexScreener profiles. It flags thin liquidity, fresh launches, and unlocked curve liquidity. It does not call Grok until you open a coin.
- **Reply.** Type `@ashline is this legit?` plus a contract. The short answer is researched, and it is not a yes or a no to trade.

## Run it

```bash
cp .env.example .env
# put your xAI key in .env
npm install
npm run dev
```

Open the local dev server. Samples: `GXTCD25QkWM7DJ6JcmNxeCKggSgh22iXKMNxPE12DkCc` on Solana, and Brett `0x532f27101965dd16442E59d40670FaF5eBB142E4` on Base.

## Grok

- Model: `grok-4.5` through the xAI Responses API
- Server tools: `x_search`, `web_search`
- Function tools the model chooses: `inspect_identity`, `inspect_holders`, `inspect_trades`, `inspect_liquidity`, `inspect_deployer`, then `file_dossier`
- The key stays in `XAI_API_KEY`. It is not in this repo.

## Onchain sources

All read-only:

- DexScreener, for the pool, chain, price, liquidity, and volume
- Rugcheck, for Solana holders, risks, and authorities
- pump.fun, for Solana curve coins and the fresh-launch tape
- Solana JSON-RPC, for the Solana trade tape and launch-slot clusters
- GoPlus token security, for EVM holders, deployer, mintable, honeypot, and LP lock
- GeckoTerminal pool trades, for the last buy on EVM pools

## Not advice

Research only. The agent does not trade, sign, or hold funds. The risk number is a count of sourced flags. It is not a buy or a sell.
