import { readChain } from "./chain.server";
import type { ChainReport, Dossier, ResearchEvent, TraceItem } from "./types";

const MODEL = "grok-4.5";
const stamps: number[] = [];

type Send = (event: ResearchEvent) => void;
type GrokItem = {
  type?: string;
  name?: string;
  arguments?: string;
  call_id?: string;
  content?: { type?: string; text?: string }[];
  query?: string;
  status?: string;
};
type GrokResponse = {
  id?: string;
  status?: string;
  error?: { message?: string } | null;
  output?: GrokItem[];
  citations?: unknown;
  usage?: {
    server_side_tool_usage_details?: {
      x_search_calls?: number;
      web_search_calls?: number;
      x_posts_fetched?: number;
    };
  };
};

function allowResearch(): boolean {
  const now = Date.now();
  while (stamps.length && now - stamps[0] > 60 * 60 * 1000) stamps.shift();
  if (stamps.length >= 20) return false;
  stamps.push(now);
  return true;
}

function clip(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function parseArgs(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function levelOf(value: unknown): Dossier["flags"][number]["level"] {
  const text = String(value ?? "").toLowerCase();
  if (text === "clear" || text === "low" || text === "info") return "clear";
  if (text === "elevated" || text === "high" || text === "critical") return "elevated";
  return "watch";
}

function asDossier(raw: Record<string, unknown>): Dossier | null {
  if (typeof raw.headline !== "string" || !raw.headline.trim()) return null;
  const flags = Array.isArray(raw.flags) ? raw.flags : [];
  const claims = Array.isArray(raw.claims) ? raw.claims : [];
  return {
    headline: clip(raw.headline, 280),
    timeline: clip(String(raw.timeline ?? ""), 1200),
    chain: clip(String(raw.chain ?? ""), 1200),
    web: clip(String(raw.web ?? ""), 900),
    flags: flags.slice(0, 8).map((row) => {
      const flag = (row ?? {}) as Record<string, unknown>;
      return {
        level: levelOf(flag.level),
        title: clip(String(flag.title ?? "Flag"), 80),
        detail: clip(String(flag.detail ?? ""), 320),
        sourceUrl: typeof flag.source_url === "string" ? flag.source_url : "",
      };
    }),
    claims: claims.slice(0, 10).map((row) => {
      const claim = (row ?? {}) as Record<string, unknown>;
      return {
        text: clip(String(claim.text ?? ""), 280),
        sourceUrl: typeof claim.source_url === "string" ? claim.source_url : "",
        sourceLabel: clip(String(claim.source_label ?? "Source"), 40),
      };
    }),
    mismatches: (Array.isArray(raw.mismatches) ? raw.mismatches : []).slice(0, 6).map((row) => {
      const item = (row ?? {}) as Record<string, unknown>;
      return {
        title: clip(String(item.title ?? "Mismatch"), 80),
        hype: clip(String(item.hype ?? ""), 280),
        chainFact: clip(String(item.chain_fact ?? ""), 280),
        sourceUrl: typeof item.source_url === "string" ? item.source_url : "",
      };
    }),
    devWallet: clip(String(raw.dev_wallet ?? ""), 90),
    devHandle: clip(String(raw.dev_handle ?? ""), 80),
    devNote: clip(String(raw.dev_note ?? ""), 500),
    earlier: (Array.isArray(raw.earlier) ? raw.earlier : []).slice(0, 6).map((row) => {
      const item = (row ?? {}) as Record<string, unknown>;
      return {
        name: clip(String(item.name ?? "Earlier launch"), 80),
        outcome: clip(String(item.outcome ?? ""), 240),
        sourceUrl: typeof item.source_url === "string" ? item.source_url : "",
      };
    }),
    reply: clip(String(raw.reply ?? ""), 500),
  };
}

function toolPayload(name: string, chain: ChainReport): Record<string, unknown> {
  const sources = chain.sources;
  if (name === "inspect_identity") {
    return {
      sources,
      chain: chain.chainLabel,
      chainId: chain.chainId,
      name: chain.name,
      symbol: chain.symbol,
      mint: chain.mint,
      description: clip(chain.description, 500),
      createdAt: chain.createdAt,
      onBondingCurve: chain.onBondingCurve,
      mintAuthority: chain.mintAuthority,
      freezeAuthority: chain.freezeAuthority,
      creators: chain.creators,
      websites: chain.websites,
      socials: chain.socials,
      risks: chain.risks,
      gaps: chain.gaps,
      reading:
        "Mint or freeze authority set to a wallet is a control flag. Null means that authority is not set on the data we read.",
    };
  }
  if (name === "inspect_holders") {
    return {
      sources,
      holders: chain.holders,
      curvePct: chain.curvePct,
      topWalletExCurvePct: chain.topWalletExCurvePct,
      top10ExCurvePct: chain.top10ExCurvePct,
      devHeldPct: chain.devHeldPct,
      rows: chain.holderRows.slice(0, 10),
      reading:
        "The bonding curve often holds most of supply. Do not call the curve a person. Judge concentration on wallets excluding the curve.",
    };
  }
  if (name === "inspect_trades") {
    return {
      sources,
      lastBuy: chain.lastBuy,
      lastTrade: chain.lastTrade,
      tape: chain.trades.slice(0, 6),
      launch: chain.launch,
      buys24h: chain.buys24h,
      sells24h: chain.sells24h,
      reading:
        "A same-slot cluster is a receipt to inspect, not proof of a bundle by itself. Say when the creation slot was outside the scan.",
    };
  }
  if (name === "inspect_deployer") {
    return {
      sources,
      chain: chain.chainLabel,
      creators: chain.creators,
      priorLaunches: chain.priorLaunches,
      devHeldPct: chain.devHeldPct,
      gaps: chain.gaps,
      reading:
        "The chain index does not list earlier launches for most deployers. Use web_search and x_search on the wallet and any handle. If you cannot find an earlier coin, say unread. Do not invent one.",
    };
  }
  return {
    sources,
    priceUsd: chain.priceUsd,
    marketCapUsd: chain.marketCapUsd,
    liquidityUsd: chain.liquidityUsd,
    volume24hUsd: chain.volume24hUsd,
    solInCurve: chain.solInCurve,
    athMarketCapUsd: chain.athMarketCapUsd,
    onBondingCurve: chain.onBondingCurve,
    reading:
      "ATH is a historical print reported by pump.fun, not a target. Bonding-curve reserves are not a locked LP.",
  };
}

const TOOLS = [
  { type: "web_search" },
  { type: "x_search" },
  ...["inspect_identity", "inspect_holders", "inspect_trades", "inspect_liquidity", "inspect_deployer"].map((name) => ({
    type: "function",
    name,
    description:
      name === "inspect_identity"
        ? "Read token name, chain, authorities, creator wallets, websites, and whether it is still on a bonding curve."
        : name === "inspect_holders"
          ? "Read holder count, top holders, pool-versus-wallet concentration, and creator balance."
          : name === "inspect_trades"
            ? "Read the last buy, the latest trade, a short tape, and any same-slot buy cluster in the launch window."
            : name === "inspect_deployer"
              ? "Read the deployer or owner wallet so you can search earlier launches and an X handle. Do not invent history."
              : "Read liquidity, market cap, volume, curve reserves, and the reported ATH print.",
    parameters: {
      type: "object",
      properties: {
        reason: { type: "string", description: "One short sentence on why you are calling this now." },
      },
      required: ["reason"],
      additionalProperties: false,
    },
  })),
  {
    type: "function",
    name: "file_dossier",
    description:
      "File the sourced research dossier. Call this only after on-chain tools and X search. Never include a buy, sell, or price target.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        headline: { type: "string", description: "One sentence cross-read of timeline versus chain. No advice." },
        timeline: { type: "string", description: "What X is saying. Only claims you can source." },
        chain: { type: "string", description: "What the chain shows: holders, last buy, liquidity, authorities, clusters." },
        web: { type: "string", description: "What the public web adds: site, docs, earlier projects, scam reports." },
        flags: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              level: { type: "string", enum: ["clear", "watch", "elevated"] },
              title: { type: "string" },
              detail: { type: "string" },
              source_url: { type: "string" },
            },
            required: ["level", "title", "detail", "source_url"],
          },
        },
        claims: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              text: { type: "string" },
              source_url: { type: "string" },
              source_label: { type: "string" },
            },
            required: ["text", "source_url", "source_label"],
          },
        },
        mismatches: {
          type: "array",
          description: "Places the timeline and the chain do not say the same thing.",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: "string" },
              hype: { type: "string" },
              chain_fact: { type: "string" },
              source_url: { type: "string" },
            },
            required: ["title", "hype", "chain_fact", "source_url"],
          },
        },
        dev_wallet: { type: "string" },
        dev_handle: { type: "string", description: "X handle if a post or page showed one. Empty if unread." },
        dev_note: { type: "string" },
        earlier: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              name: { type: "string" },
              outcome: { type: "string" },
              source_url: { type: "string" },
            },
            required: ["name", "outcome", "source_url"],
          },
        },
        reply: {
          type: "string",
          description: "Short answer to @agent is this legit? Receipts only. No buy, sell, or yes-or-no trade.",
        },
      },
      required: ["headline", "timeline", "chain", "web", "flags", "claims", "mismatches", "dev_wallet", "dev_handle", "dev_note", "earlier", "reply"],
    },
  },
];

const INSTRUCTIONS = `You are Ashline, a read-only memecoin research agent running on Grok.
You decide which tools to call and in what order. A hunch is not a finding.
Use the inspect_* tools for chain facts. Use x_search for the timeline. Use web_search for sites, docs, and scam reports.
Every claim needs a receipt URL from a tool result, an X post, or a page you opened.
Cross-check the timeline against holder spread, liquidity, creator wallets, and trade clusters.
If sources disagree, say so. If a fact was not in a tool result, say it is unread. Never invent wallets, percentages, or posts.
Do not tell anyone to buy, sell, ape, avoid, or hold. No price targets. Research only.
When the timeline and the chain disagree, put that in mismatches. Follow the deployer wallet with inspect_deployer, then search X and the web for earlier launches and a handle. If you cannot source an earlier coin, leave earlier empty.
The reply field answers "@agent is this legit?" in a few sentences. It says what the receipts show. It is not a yes, a no, or a trade.
File the dossier with file_dossier once chain tools and X search have actually run.`;

async function callGrok(key: string, body: Record<string, unknown>): Promise<GrokResponse> {
  const res = await fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      max_output_tokens: 3200,
      reasoning: { effort: "low" },
      ...body,
    }),
    signal: AbortSignal.timeout(75_000),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error("Ashline Grok error", res.status, text.slice(0, 400));
    throw new Error(`Grok could not answer (${res.status}).`);
  }
  return JSON.parse(text) as GrokResponse;
}

function collectUrls(value: unknown, into: Set<string>, depth = 0) {
  if (depth > 5 || value == null) return;
  if (typeof value === "string") {
    const matches = value.match(/https?:\/\/[^\s)"'<>]+/g);
    matches?.forEach((url) => into.add(url.replace(/[.,]+$/, "")));
    return;
  }
  if (Array.isArray(value)) {
    for (const row of value) collectUrls(row, into, depth + 1);
    return;
  }
  if (typeof value === "object") {
    const row = value as Record<string, unknown>;
    if (typeof row.url === "string") into.add(row.url);
    for (const nested of Object.values(row)) collectUrls(nested, into, depth + 1);
  }
}

function trace(id: string, tool: string, state: TraceItem["state"], detail: string): ResearchEvent {
  return { type: "trace", item: { id, tool, state, detail: clip(detail, 180) } };
}

async function runAgent(mint: string, chain: ChainReport, send: Send, mode: "report" | "reply") {
  const key = process.env.XAI_API_KEY;
  if (!key) {
    send({ type: "error", message: "Grok is not available in this environment. The chain reading above is still live." });
    return;
  }

  let input: unknown = [
    {
      role: "user",
      content: `Research this ${chain.chainLabel} contract and file a sourced dossier: ${mint}
${mode === "reply" ? 'The person asked "@agent is this legit?". Answer in the reply field from receipts only.' : "File the one-page report with mismatches and the deployer trail."}
Canonical links, cite only if tools agree they belong to this contract:
${chain.sources.map((source) => source.url).join("\n")}`,
    },
  ];
  let previous: string | undefined;
  let filed: Dossier | null = null;
  const called = new Set<string>();
  let refusedChain = false;
  let refusedX = false;
  let xCalls = 0;
  const citations = new Set<string>();

  for (let round = 0; round < 4 && !filed; round++) {
    send(trace(`turn-${round}`, "grok", "running", round === 0 ? "Choosing which side to read first." : "Working from the last receipts."));
    const payload: Record<string, unknown> = { input, tools: TOOLS };
    if (previous) payload.previous_response_id = previous;
    else payload.instructions = INSTRUCTIONS;
    const response = await callGrok(key, payload);
    previous = response.id;
    if (response.error?.message) throw new Error(response.error.message);

    const usage = response.usage?.server_side_tool_usage_details;
    xCalls += usage?.x_search_calls ?? 0;
    if ((usage?.x_search_calls ?? 0) > 0) {
      const posts = usage?.x_posts_fetched ? ` · ${usage.x_posts_fetched} posts fetched` : "";
      send(trace(`x-${round}`, "x_search", "done", `Searched X${posts}.`));
    }
    if ((usage?.web_search_calls ?? 0) > 0) {
      send(trace(`web-${round}`, "web_search", "done", "Searched the web."));
    }
    collectUrls(response.output, citations);
    collectUrls(response.citations, citations);

    const calls = (response.output ?? []).filter((item) => item.type === "function_call" && item.name && item.call_id);
    const ordered = [
      ...calls.filter((item) => item.name !== "file_dossier"),
      ...calls.filter((item) => item.name === "file_dossier"),
    ];
    send(trace(`turn-${round}`, "grok", "done", ordered.length ? `Called ${ordered.map((item) => item.name).join(", ")}.` : "No function call this turn."));

    if (!ordered.length) {
      input = [
        {
          role: "user",
          content:
            "File the dossier now if chain tools and X search already ran. Otherwise call the missing inspect_* tools and x_search, then file_dossier. No buy or sell language.",
        },
      ];
      continue;
    }

    const outputs: { type: "function_call_output"; call_id: string; output: string }[] = [];
    for (const call of ordered) {
      const args = parseArgs(call.arguments);
      const reason = typeof args.reason === "string" ? args.reason : "Reading this source.";
      if (call.name === "file_dossier") {
        const onchain = [...called].some((name) => name.startsWith("inspect_"));
        if (!onchain && !refusedChain) {
          refusedChain = true;
          send(trace(`file-${round}`, "file_dossier", "refused", "Asked for an on-chain tool before the dossier can be filed."));
          outputs.push({
            type: "function_call_output",
            call_id: call.call_id!,
            output: JSON.stringify({ accepted: false, error: "Call at least one inspect_* tool before filing." }),
          });
          continue;
        }
        if (xCalls < 1 && !refusedX) {
          refusedX = true;
          send(trace(`file-${round}`, "file_dossier", "refused", "Asked for X search so timeline claims have receipts."));
          outputs.push({
            type: "function_call_output",
            call_id: call.call_id!,
            output: JSON.stringify({ accepted: false, error: "Use x_search before filing the dossier." }),
          });
          continue;
        }
        const dossier = asDossier(args);
        if (!dossier) {
          outputs.push({
            type: "function_call_output",
            call_id: call.call_id!,
            output: JSON.stringify({ accepted: false, error: "Dossier did not match the schema. Re-file it." }),
          });
          continue;
        }
        filed = dossier;
        send(trace(`file-${round}`, "file_dossier", "done", "Dossier filed."));
        outputs.push({
          type: "function_call_output",
          call_id: call.call_id!,
          output: JSON.stringify({ accepted: true }),
        });
        continue;
      }

      if (!call.name?.startsWith("inspect_")) {
        outputs.push({
          type: "function_call_output",
          call_id: call.call_id!,
          output: JSON.stringify({ error: "Unknown tool." }),
        });
        continue;
      }
      called.add(call.name);
      send(trace(`${call.name}-${round}`, call.name, "done", reason));
      outputs.push({
        type: "function_call_output",
        call_id: call.call_id!,
        output: JSON.stringify(toolPayload(call.name, chain)),
      });
    }
    input = outputs;
  }

  if (!filed) {
    send({
      type: "error",
      message: "Grok stopped before filing a dossier. Holder and trade receipts above are still from the chain.",
    });
    return;
  }
  const urls = [...citations].filter((url) => /^https?:\/\//.test(url)).slice(0, 12);
  if (urls.length) send({ type: "citations", urls });
  send({ type: "dossier", dossier: filed });
}

export function openResearch(mint: string, mode: "report" | "reply" = "report"): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      const send: Send = (event) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      try {
        if (!allowResearch()) {
          send({ type: "error", message: "Ashline is pausing new Grok reads for a bit. The chain desk still works." });
          return;
        }
        send({ type: "status", text: "Reading the chain." });
        const chain = await readChain(mint);
        send({ type: "chain", chain });
        send({ type: "status", text: "Grok is choosing tools." });
        await runAgent(mint, chain, send, mode);
        send({ type: "done" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "The read failed.";
        send({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });
}
