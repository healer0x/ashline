import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Copy, Search } from "lucide-react";
import { loadChain, research } from "@/lib/research.functions";
import { ago, compactNum, extractMint, mintGroups, safeHref, shortAddr, sol, usd } from "@/lib/mint";
import type { ChainReport, Dossier, ResearchEvent, TraceItem, Trade } from "@/lib/types";

const SAMPLE = "GXTCD25QkWM7DJ6JcmNxeCKggSgh22iXKMNxPE12DkCc";

const TOOL_LABEL: Record<string, string> = {
  grok: "Grok",
  x_search: "X search",
  web_search: "Web search",
  inspect_identity: "Identity",
  inspect_holders: "Holders",
  inspect_trades: "Trades",
  inspect_liquidity: "Liquidity",
  file_dossier: "Dossier",
};

type Recent = { mint: string; symbol: string };

export function Desk() {
  const [draft, setDraft] = useState("");
  const [mint, setMint] = useState<string | null>(null);
  const [editing, setEditing] = useState(true);
  const [chain, setChain] = useState<ChainReport | null>(null);
  const [chainLoading, setChainLoading] = useState(false);
  const [chainError, setChainError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [traces, setTraces] = useState<TraceItem[]>([]);
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [citations, setCitations] = useState<string[]>([]);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [reject, setReject] = useState<string | null>(null);
  const [recents, setRecents] = useState<Recent[]>([]);
  const chainSeq = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("ashline.recents");
      if (!raw) return;
      const parsed = JSON.parse(raw) as Recent[];
      if (Array.isArray(parsed)) setRecents(parsed.slice(0, 4));
    } catch {
      /* ignore broken local history */
    }
  }, []);

  useEffect(() => {
    if (!mint) return;
    const seq = ++chainSeq.current;
    setChainLoading(true);
    setChainError(null);
    loadChain({ data: { mint } })
      .then((report) => {
        if (chainSeq.current !== seq) return;
        setChain(report);
        setRecents((current) => {
          const next = [{ mint, symbol: report.symbol }, ...current.filter((row) => row.mint !== mint)].slice(0, 4);
          localStorage.setItem("ashline.recents", JSON.stringify(next));
          return next;
        });
      })
      .catch((error: unknown) => {
        if (chainSeq.current !== seq) return;
        setChain(null);
        setChainError(error instanceof Error ? error.message : "The chain read failed.");
      })
      .finally(() => {
        if (chainSeq.current === seq) setChainLoading(false);
      });
  }, [mint]);

  function lockMint(value: string) {
    const next = extractMint(value);
    if (!next || next.length < 43) {
      setReject(
        next
          ? "That address looks cut off. A Solana contract is usually 43–44 characters."
          : "Paste the full contract. Any Solana coin works, not only $GROKATHON.",
      );
      return null;
    }
    setReject(null);
    setDraft(next);
    setMint(next);
    setEditing(false);
    if (next !== mint) {
      setDossier(null);
      setTraces([]);
      setCitations([]);
      setAgentError(null);
      setStatus(null);
    }
    return next;
  }

  async function readBothSides() {
    if (running) return;
    const next = lockMint(mint ?? draft);
    if (!next) return;
    setRunning(true);
    setAgentError(null);
    setDossier(null);
    setTraces([]);
    setCitations([]);
    setStatus("Opening the desk.");
    try {
      const response = await research({ data: { mint: next } });
      if (!(response instanceof Response) || !response.body) {
        throw new Error("Grok returned an unexpected response.");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const apply = (event: ResearchEvent) => {
        if (event.type === "status") setStatus(event.text);
        if (event.type === "chain") setChain(event.chain);
        if (event.type === "trace") {
          setTraces((current) => {
            const rest = current.filter((item) => item.id !== event.item.id);
            return [...rest, event.item];
          });
        }
        if (event.type === "dossier") setDossier(event.dossier);
        if (event.type === "citations") setCitations(event.urls);
        if (event.type === "error") setAgentError(event.message);
      };
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          apply(JSON.parse(line) as ResearchEvent);
        }
      }
      if (buffer.trim()) apply(JSON.parse(buffer) as ResearchEvent);
    } catch (error) {
      setAgentError(error instanceof Error ? error.message : "The read failed.");
    } finally {
      setRunning(false);
    }
  }

  async function copyMint() {
    if (!mint) return;
    await navigator.clipboard.writeText(mint);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Mark />
          <div>
            <p className="font-serif text-xl leading-none">Ashline</p>
            <p className="mt-1 text-xs tracking-widest text-mute uppercase">Grok research desk</p>
          </div>
        </div>
        <p className="max-w-40 text-right text-xs text-mute sm:max-w-none">Research, not advice. Read only.</p>
      </header>

      <section className="mt-10 max-w-3xl">
        <p className="text-xs font-medium tracking-widest text-filament uppercase">Both sides of the coin</p>
        <h1 className="mt-3 font-serif text-5xl leading-tight text-balance sm:text-6xl">
          The trail the vibes left.
        </h1>
        <p className="mt-4 max-w-2xl text-pretty text-base text-mute sm:text-lg">
          Paste a Solana contract. Ashline shows the holders and the last buy, then Grok reads the timeline,
          the chain, and the web. You get receipts and red flags. Not a buy signal.
        </p>
      </section>

      <section className="mt-8">
        <label htmlFor="contract" className="text-xs font-medium tracking-widest text-mute uppercase">
          Contract address
        </label>
        {editing || !mint ? (
          <input
            id="contract"
            ref={inputRef}
            value={draft}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Any Solana contract, or a pump.fun link"
            className="mt-2 h-14 w-full rounded-2xl bg-card px-4 font-mono text-xs text-ink shadow-card outline-none placeholder:text-mute sm:text-sm"
            onChange={(event) => {
              const value = event.target.value;
              setDraft(value);
              const next = extractMint(value);
              if (next && next.length >= 43) lockMint(value);
              else if (value.trim().length > 20) {
                setReject(
                  next
                    ? "That address looks cut off. A Solana contract is usually 43–44 characters."
                    : "That is not a full Solana contract yet. Paste the whole address.",
                );
              } else setReject(null);
            }}
            onPaste={(event) => {
              const text = event.clipboardData.getData("text");
              if (!text) return;
              if (extractMint(text)) {
                event.preventDefault();
                lockMint(text);
              }
            }}
            onBlur={() => {
              if (extractMint(draft)) lockMint(draft);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void readBothSides();
              }
            }}
          />
        ) : (
          <div className="rise mt-2 rounded-2xl bg-ink p-4 text-paper shadow-plate sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs tracking-widest text-filament uppercase">On the plate</p>
              <button
                type="button"
                className="h-10 px-2 text-xs text-paper/80"
                onClick={() => setEditing(true)}
              >
                Paste another
              </button>
            </div>
            <p className="mt-3 flex flex-wrap gap-1.5 font-mono text-sm sm:text-base" aria-label={mint}>
              {mintGroups(mint).map((group, index) => (
                <span key={`${group}-${index}`} className="rounded-md bg-ash px-1.5 py-0.5">
                  {group}
                </span>
              ))}
            </p>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="h-11 rounded-full bg-filament px-5 text-sm font-medium text-paper disabled:opacity-50" disabled={running} onClick={() => void readBothSides()}>
            {running ? "Grok is reading" : "Read both sides"}
          </button>
          <a
            className={`inline-flex h-11 items-center gap-1.5 rounded-full bg-ink px-4 text-sm font-medium text-paper ${mint ? "" : "pointer-events-none opacity-40"}`}
            href={mint ? `https://pump.fun/coin/${mint}` : undefined}
            target="_blank"
            rel="noreferrer"
          >
            pump.fun
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </a>
          <a
            className={`inline-flex h-11 items-center rounded-full bg-card px-4 text-sm font-medium text-ink shadow-card ${mint ? "" : "pointer-events-none opacity-40"}`}
            href={mint ? `https://solscan.io/token/${mint}` : undefined}
            target="_blank"
            rel="noreferrer"
          >
            Solscan
          </a>
          <button type="button" className="inline-flex h-11 items-center gap-2 rounded-full bg-card px-4 text-sm font-medium text-ink shadow-card disabled:opacity-40" disabled={!mint} onClick={() => void copyMint()}>
            <Copy className="size-4" aria-hidden="true" />
            {copied ? "Copied" : "Copy CA"}
          </button>
        </div>

        {reject ? (
          <p role="alert" className="mt-3 text-sm text-ember">
            {reject}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <button type="button" className="h-10 rounded-full px-3 text-filament" onClick={() => lockMint(SAMPLE)}>
            Try $GROKATHON
          </button>
          {recents
            .filter((row) => row.mint !== mint)
            .map((row) => (
              <button key={row.mint} type="button" className="h-10 rounded-full px-3 font-mono text-xs text-mute" onClick={() => lockMint(row.mint)}>
                {row.symbol} {shortAddr(row.mint)}
              </button>
            ))}
        </div>
      </section>

      {!mint ? <Lenses /> : null}

      {mint ? (
        <div className="mt-8 grid items-start gap-6 lg:grid-cols-12">
          <section className="space-y-4 lg:col-span-7">
            {chainError ? (
              <p role="alert" className="rounded-2xl bg-card px-4 py-3 text-sm text-ember shadow-card">
                {chainError}
              </p>
            ) : null}
            {chainLoading && !chain ? <ChainSkeleton /> : null}
            {chain ? <ChainDesk chain={chain} /> : null}
          </section>
          <aside className="lg:sticky lg:top-4 lg:col-span-5">
            <AgentPanel
              running={running}
              status={status}
              traces={traces}
              dossier={dossier}
              citations={citations}
              error={agentError}
              idle={!running && traces.length === 0 && !dossier && !agentError}
            />
          </aside>
        </div>
      ) : null}

      <footer className="mt-12 border-t border-rule pt-4 text-xs text-pretty text-mute">
        Not financial advice. Ashline does not trade, sign, or hold funds. Findings are receipts from X, the chain, and the
        public web. Holders decide.
      </footer>
    </main>
  );
}

function Mark() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden="true">
      <rect x="1" y="1" width="34" height="34" rx="10" fill="var(--color-ink)" />
      <circle cx="18" cy="10" r="2" fill="var(--color-paper)" opacity="0.45" />
      <circle cx="18" cy="17" r="2" fill="var(--color-paper)" opacity="0.75" />
      <circle cx="18" cy="25" r="2.4" fill="var(--color-filament)" />
    </svg>
  );
}

function Lenses() {
  const items = [
    { title: "Timeline", copy: "Grok searches X for the ticker, the mint, and whoever is posting." },
    { title: "Chain", copy: "Holders, the last buy, liquidity, authorities, and clustered launch buys." },
    { title: "Web", copy: "The site, the docs, earlier launches, and anything already called a scam." },
  ];
  return (
    <div className="mt-10 grid gap-3 sm:grid-cols-3">
      {items.map((item) => (
        <article key={item.title} className="rounded-2xl bg-card p-4 shadow-card">
          <h2 className="font-serif text-2xl">{item.title}</h2>
          <p className="mt-2 text-sm text-pretty text-mute">{item.copy}</p>
        </article>
      ))}
    </div>
  );
}

function ChainSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <div className="h-28 animate-pulse rounded-2xl bg-card shadow-card" />
      <div className="h-24 animate-pulse rounded-2xl bg-card shadow-card" />
      <div className="h-48 animate-pulse rounded-2xl bg-card shadow-card" />
    </div>
  );
}

function ChainDesk({ chain }: { chain: ChainReport }) {
  return (
    <div className="space-y-4">
      <article className="rounded-2xl bg-card p-4 shadow-card sm:p-5">
        <div className="flex gap-4">
          {chain.image ? (
            <img
              src={chain.image}
              alt=""
              className="size-14 shrink-0 rounded-xl object-cover outline outline-1 -outline-offset-1 outline-ink/10"
            />
          ) : (
            <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-ink font-serif text-xl text-paper">
              {chain.symbol.slice(0, 1)}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <h2 className="font-serif text-3xl leading-none">{chain.name}</h2>
              <p className="font-mono text-sm text-mute">${chain.symbol}</p>
            </div>
            <p className="mt-2 text-sm text-mute">
              {chain.onBondingCurve === true
                ? "Still on the pump.fun curve"
                : chain.onBondingCurve === false
                  ? "Graduated off the pump.fun curve"
                  : "Trading outside the pump.fun curve"}
              {chain.createdAt ? ` · launched ${ago(chain.createdAt)}` : ""}
              {chain.holders != null ? ` · ${chain.holders} holders` : ""}
            </p>
          </div>
        </div>
        {chain.description ? (
          <p className="mt-4 line-clamp-3 text-sm text-pretty text-ink/80">{chain.description}</p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {chain.websites.map((site) => (
            <External key={site.url} href={site.url} label={site.label} />
          ))}
          {chain.socials.map((site) => (
            <External key={site.url} href={site.url} label={site.type} />
          ))}
          <External href={chain.dexUrl} label="DexScreener" />
          <External href={chain.rugcheckUrl} label="Rugcheck" />
        </div>
      </article>

      <dl className="grid grid-cols-2 overflow-hidden rounded-2xl bg-rule shadow-card sm:grid-cols-4">
        <Stat label="Market cap" value={usd(chain.marketCapUsd)} />
        <Stat label="Liquidity" value={usd(chain.liquidityUsd)} />
        <Stat label="24h volume" value={usd(chain.volume24hUsd)} />
        <Stat label="SOL in curve" value={sol(chain.solInCurve)} />
      </dl>

      <LastBuy chain={chain} />
      <Holders chain={chain} />

      <article className="rounded-2xl bg-card p-4 text-sm shadow-card sm:p-5">
        <h3 className="font-serif text-2xl">Authorities</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Authority label="Mint authority" value={chain.mintAuthority} />
          <Authority label="Freeze authority" value={chain.freezeAuthority} />
        </div>
        {chain.creators.length ? (
          <ul className="mt-4 space-y-2">
            {chain.creators.map((creator) => (
              <li key={creator.address} className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-mute">{creator.role}</span>
                <a className="font-mono text-xs" href={`https://solscan.io/account/${creator.address}`} target="_blank" rel="noreferrer">
                  {shortAddr(creator.address)}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
        {chain.devHeldPct != null ? (
          <p className="mt-3 text-mute">
            Creator wallets in the top list hold {chain.devHeldPct.toFixed(2)}% of supply.
          </p>
        ) : null}
        {chain.launch ? <p className="mt-2 text-pretty text-mute">{chain.launch.note}</p> : null}
        {chain.risks.length ? (
          <ul className="mt-3 space-y-1">
            {chain.risks.map((risk) => (
              <li key={risk.name}>
                <span className="font-medium">{risk.name}.</span> {risk.detail}
              </li>
            ))}
          </ul>
        ) : null}
        {chain.gaps.length ? <p className="mt-3 text-mute">{chain.gaps.join(" ")}</p> : null}
      </article>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card px-4 py-3">
      <dt className="text-xs text-mute">{label}</dt>
      <dd className="mt-1 font-serif text-2xl tabular-nums">{value}</dd>
    </div>
  );
}

function LastBuy({ chain }: { chain: ChainReport }) {
  const buy = chain.lastBuy;
  const latest = chain.lastTrade;
  return (
    <article className="rounded-2xl bg-ink p-4 text-paper sm:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-xs tracking-widest text-filament uppercase">Last buy</h3>
        <p className="text-xs text-paper/70">{buy ? ago(buy.time) : "Unread"}</p>
      </div>
      {buy ? (
        <>
          <p className="mt-3 font-serif text-4xl tabular-nums">{sol(buy.sol)}</p>
          <p className="mt-1 text-sm text-paper/80">{compactNum(buy.tokens)} tokens</p>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
            <a className="font-mono text-xs" href={`https://solscan.io/account/${buy.wallet}`} target="_blank" rel="noreferrer">
              {shortAddr(buy.wallet)}
            </a>
            <a className="inline-flex items-center gap-1 text-filament" href={buy.url} target="_blank" rel="noreferrer">
              Receipt
              <ArrowUpRight className="size-4" aria-hidden="true" />
            </a>
          </div>
        </>
      ) : (
        <p className="mt-3 text-sm text-paper/80">No buy in the scanned signatures.</p>
      )}
      {latest && latest.signature !== buy?.signature ? (
        <p className="mt-4 border-t border-paper/15 pt-3 text-sm text-paper/75">
          Latest trade is a {latest.side} · {sol(latest.sol)} · {ago(latest.time)}
        </p>
      ) : null}
      {chain.trades.length ? (
        <ul className="mt-4 space-y-2">
          {chain.trades.slice(0, 5).map((trade) => (
            <TapeRow key={trade.signature} trade={trade} />
          ))}
        </ul>
      ) : null}
    </article>
  );
}

function TapeRow({ trade }: { trade: Trade }) {
  return (
    <li className="grid grid-cols-[3.5rem_1fr_3.2rem_4.5rem] items-center gap-2 text-xs">
      <span className="uppercase tracking-wider text-paper/60">{trade.side}</span>
      <span className="tabular-nums">{sol(trade.sol)}</span>
      <span className="text-paper/60">{ago(trade.time)}</span>
      <a className="font-mono" href={trade.url} target="_blank" rel="noreferrer">
        {shortAddr(trade.wallet)}
      </a>
    </li>
  );
}

function Holders({ chain }: { chain: ChainReport }) {
  return (
    <article className="rounded-2xl bg-card p-4 shadow-card sm:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-serif text-2xl">Holders</h3>
        <a className="text-sm text-filament" href={chain.rugcheckUrl} target="_blank" rel="noreferrer">
          Rugcheck
        </a>
      </div>
      <p className="mt-2 text-sm text-pretty text-mute">
        {chain.curvePct != null ? `Curve accounts hold ${chain.curvePct.toFixed(1)}%. ` : ""}
        {chain.topWalletExCurvePct != null
          ? `Largest wallet outside the curve holds ${chain.topWalletExCurvePct.toFixed(2)}%. `
          : ""}
        {chain.top10ExCurvePct != null ? `Top wallets outside the curve, combined, hold ${chain.top10ExCurvePct.toFixed(2)}%.` : ""}
      </p>
      <ul className="mt-4 space-y-3">
        {chain.holderRows.map((row) => (
          <li key={row.owner}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <a className="truncate font-mono text-xs" href={`https://solscan.io/account/${row.owner}`} target="_blank" rel="noreferrer">
                {row.label ? `${row.label} · ` : ""}
                {shortAddr(row.owner)}
              </a>
              <span className="shrink-0 tabular-nums">{row.pct.toFixed(2)}%</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-rule">
              <div
                className={`h-full rounded-full ${row.isCurve ? "bg-ink" : row.isDev ? "bg-ember" : "bg-filament"}`}
                style={{ width: `${Math.max(1.5, Math.min(100, row.pct))}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
      {!chain.holderRows.length ? <p className="mt-3 text-sm text-mute">Holder list unread.</p> : null}
    </article>
  );
}

function Authority({ label, value }: { label: string; value: string | null }) {
  const open = Boolean(value);
  return (
    <div>
      <p className="text-xs text-mute">{label}</p>
      <p className={`mt-1 font-medium ${open ? "text-ember" : ""}`}>{open ? shortAddr(value as string) : "Not set"}</p>
    </div>
  );
}

function External({ href, label }: { href: string; label: string }) {
  const safe = safeHref(href);
  if (!safe) return null;
  return (
    <a className="inline-flex items-center gap-1 text-filament" href={safe} target="_blank" rel="noreferrer">
      {label}
      <ArrowUpRight className="size-3.5" aria-hidden="true" />
    </a>
  );
}

function AgentPanel({
  running,
  status,
  traces,
  dossier,
  citations,
  error,
  idle,
}: {
  running: boolean;
  status: string | null;
  traces: TraceItem[];
  dossier: Dossier | null;
  citations: string[];
  error: string | null;
  idle: boolean;
}) {
  return (
    <div className="rounded-2xl bg-card p-4 shadow-card sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-serif text-2xl">The agent</h2>
        {running ? (
          <span className="flex h-4 items-end gap-1" aria-hidden="true">
            {[0, 1, 2, 3].map((bar) => (
              <span key={bar} className="filament-bar h-4 w-1 rounded-full bg-filament" style={{ animationDelay: `${bar * 120}ms` }} />
            ))}
          </span>
        ) : (
          <Search className="size-4 text-mute" aria-hidden="true" />
        )}
      </div>
      <p className="mt-1 text-sm text-mute">
        {dossier ? "Dossier filed. Research, not a signal." : (status ?? "Grok decides the order. Tool calls show up here.")}
      </p>

      {idle ? (
        <p className="mt-6 text-sm text-pretty text-mute">
          Paste a contract, then ask Grok to read both sides. X search, web search, and the on-chain tools are chosen by the model. Nothing here is a signal to trade.
        </p>
      ) : null}

      {traces.length ? (
        <ol className="mt-5 space-y-3">
          {traces.map((item) => (
            <li key={item.id} className="border-t border-rule pt-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">{TOOL_LABEL[item.tool] ?? item.tool}</p>
                <p className={`text-xs tracking-wider uppercase ${item.state === "refused" ? "text-ember" : "text-mute"}`}>
                  {item.state}
                </p>
              </div>
              <p className="mt-1 text-sm text-pretty text-mute">{item.detail}</p>
            </li>
          ))}
        </ol>
      ) : null}

      {error ? (
        <p role="alert" className="mt-4 text-sm text-ember">
          {error}
        </p>
      ) : null}

      {dossier ? <DossierView dossier={dossier} citations={citations} /> : null}
    </div>
  );
}

function DossierView({ dossier, citations }: { dossier: Dossier; citations: string[] }) {
  const blocks = [
    { label: "What X is saying", text: dossier.timeline },
    { label: "What the chain is showing", text: dossier.chain },
    { label: "What the web adds", text: dossier.web },
  ];
  return (
    <div className="mt-6 border-t border-rule pt-5">
      <p className="text-xs tracking-widest text-filament uppercase">Filed dossier</p>
      <h3 className="mt-2 font-serif text-3xl leading-tight text-balance">{dossier.headline}</h3>
      <div className="mt-5 space-y-4">
        {blocks.map((block) => (
          <section key={block.label}>
            <h4 className="text-xs tracking-widest text-mute uppercase">{block.label}</h4>
            <p className="mt-1 text-sm text-pretty">{block.text || "Unread."}</p>
          </section>
        ))}
      </div>
      {dossier.flags.length ? (
        <ul className="mt-5 space-y-3">
          {dossier.flags.map((flag) => (
            <li key={`${flag.title}-${flag.detail}`} className="rounded-xl bg-paper px-3 py-3">
              <p className={`text-xs tracking-widest uppercase ${flag.level === "elevated" ? "text-ember" : flag.level === "watch" ? "text-filament" : "text-mute"}`}>
                {flag.level}
              </p>
              <p className="mt-1 font-medium">{flag.title}</p>
              <p className="mt-1 text-sm text-pretty text-mute">{flag.detail}</p>
              <Receipt href={flag.sourceUrl} label="Source" />
            </li>
          ))}
        </ul>
      ) : null}
      {dossier.claims.length ? (
        <ul className="mt-5 space-y-3">
          {dossier.claims.map((claim) => (
            <li key={`${claim.sourceLabel}-${claim.text}`} className="text-sm">
              <p className="text-pretty">{claim.text}</p>
              <Receipt href={claim.sourceUrl} label={claim.sourceLabel} />
            </li>
          ))}
        </ul>
      ) : null}
      {citations.length ? (
        <div className="mt-5">
          <p className="text-xs tracking-widest text-mute uppercase">Raw receipts</p>
          <ul className="mt-2 space-y-1">
            {citations.map((url) => (
              <li key={url}>
                <Receipt href={url} label={shortLink(url)} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="mt-5 text-xs text-mute">Not financial advice. No buy, no sell, no target.</p>
    </div>
  );
}

function Receipt({ href, label }: { href: string; label: string }) {
  const safe = safeHref(href);
  if (!safe) return <p className="mt-1 text-xs text-mute">No link returned</p>;
  return (
    <a className="mt-1 inline-flex max-w-full items-center gap-1 text-xs text-filament" href={safe} target="_blank" rel="noreferrer">
      <span className="truncate">{label}</span>
      <ArrowUpRight className="size-3.5 shrink-0" aria-hidden="true" />
    </a>
  );
}

function shortLink(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === "/" ? "" : parsed.pathname.slice(0, 28);
    return `${parsed.hostname}${path}`;
  } catch {
    return "Receipt";
  }
}
