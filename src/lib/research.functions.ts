import { createServerFn } from "@tanstack/react-start";
import { readChain } from "./chain.server";
import { openResearch } from "./grok.server";
import { extractMint } from "./mint";

function requireMint(data: { mint?: string }) {
  const mint = extractMint(data?.mint ?? "");
  if (!mint) throw new Error("That does not look like a Solana contract address.");
  return { mint };
}

export const loadChain = createServerFn({ method: "POST" })
  .validator((data: { mint: string }) => requireMint(data))
  .handler(async ({ data }) => readChain(data.mint));

export const research = createServerFn({ method: "POST" })
  .validator((data: { mint: string }) => requireMint(data))
  .handler(({ data }) => {
    return new Response(openResearch(data.mint), {
      headers: {
        "content-type": "application/x-ndjson; charset=utf-8",
        "cache-control": "no-cache, no-transform",
      },
    });
  });
