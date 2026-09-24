import { createServerFn } from "@tanstack/react-start";
import { readChain } from "./chain.server";
import { openResearch } from "./grok.server";
import { extractMint } from "./mint";
import { readTape } from "./tape.server";

function requireMint(data: { mint?: string; mode?: string }) {
  const mint = extractMint(data?.mint ?? "");
  if (!mint) throw new Error("Paste a Solana mint or a 0x contract.");
  return { mint, mode: data?.mode === "reply" ? ("reply" as const) : ("report" as const) };
}

export const loadChain = createServerFn({ method: "POST" })
  .validator((data: { mint: string }) => requireMint(data))
  .handler(async ({ data }) => readChain(data.mint));

export const loadTape = createServerFn({ method: "GET" }).handler(async () => readTape());

export const research = createServerFn({ method: "POST" })
  .validator((data: { mint: string; mode?: string }) => requireMint(data))
  .handler(({ data }) => {
    return new Response(openResearch(data.mint, data.mode), {
      headers: {
        "content-type": "application/x-ndjson; charset=utf-8",
        "cache-control": "no-cache, no-transform",
      },
    });
  });
