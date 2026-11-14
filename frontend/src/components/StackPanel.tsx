import { useEffect, useMemo, useRef, useState } from "react";
import type { GraphResponse } from "../api/types";
import { ARCHETYPES, SLOTS_BY_ID } from "../recommend/catalog";
import { StackIndex, recommendStack, recommendationMarkdown, type Pick, type Recommendation } from "../recommend/recommend";
import { EXPLAIN_ENABLED, explainRequest, explainStack } from "../recommend/explain";
import type { StackParams } from "../recommend/stackLink";

const EXAMPLES = [
  "A SaaS dashboard on Next.js with accounts and Stripe billing",
  "A REST API for an inventory system in Python",
  "A chatbot that answers questions over our docs",
  "A Flutter mobile app with offline sync",
];

const SOURCE_LABEL: Record<Pick["source"], string> = {
  current: "In your repo", mentioned: "You named it", chosen: "Your pick", recommended: "Suggested",
};

interface Props {
  graph: GraphResponse;
  params: StackParams;
  onParamsChange: (p: StackParams) => void;
  /** Label for the scanned repository when the stack starts from a scan. */
  currentLabel?: string | null;
  onPick: (id: string) => void;
  onHighlight: (nodeIds: string[], edgeIds: string[]) => void;
  onClose: () => void;
}

/**
 * Stack recommender (Phase 2): describe a project, get a stack where every pick says why,
 * citing the atlas relationships behind it. The picks light up on the atlas.
 */
export function StackPanel({ graph, params, onParamsChange, currentLabel, onPick, onHighlight, onClose }: Props) {
  const index = useMemo(() => new StackIndex(graph), [graph]);
  const [draft, setDraft] = useState(params.description);
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState<"md" | "link" | null>(null);
  const [explain, setExplain] = useState<{ state: "idle" | "loading" | "done" | "error"; text: string }>({ state: "idle", text: "" });
  const explainAbort = useRef<AbortController | null>(null);
  const current = useMemo(() => params.current.map((s) => index.node(s)?.id).filter((id): id is string => !!id), [params.current, index]);
  const asked = params.description.trim().length > 0 || current.length > 0 || !!params.archetype;

  const rec: Recommendation | null = useMemo(() => asked ? recommendStack(index, {
    description: params.description, archetype: params.archetype, language: params.language,
    current, overrides: params.overrides,
  }) : null, [asked, index, params, current]);

  useEffect(() => {
    if (!rec) { onHighlight([], []); return; }
    onHighlight([...rec.picks.map((p) => p.node.id), ...rec.extras.map((n) => n.id)], rec.edgeIds);
  }, [rec, onHighlight]);
  useEffect(() => () => onHighlight([], []), [onHighlight]);
  useEffect(() => { setExplain({ state: "idle", text: "" }); explainAbort.current?.abort(); }, [rec]);

  const submit = (description: string) => {
    setDraft(description);
    onParamsChange({ ...params, description, overrides: {} });
  };
  const copy = (kind: "md" | "link") => {
    const text = kind === "md" && rec ? recommendationMarkdown(rec, window.location.href) : window.location.href;
    void navigator.clipboard?.writeText(text).then(() => { setCopied(kind); window.setTimeout(() => setCopied(null), 1500); }, () => undefined);
  };
  const runExplain = () => {
    if (!rec) return;
    explainAbort.current?.abort();
    const ctrl = new AbortController();
    explainAbort.current = ctrl;
    setExplain({ state: "loading", text: "" });
    explainStack(explainRequest(params.description, rec), ctrl.signal)
      .then((text) => setExplain({ state: "done", text }))
      .catch((e: Error) => { if (e.name !== "AbortError") setExplain({ state: "error", text: e.message }); });
  };

  return (
    <section className="stack-panel" aria-label="Stack recommender">
      <button type="button" className="outline-close" onClick={onClose} aria-label="Close stack recommender">×</button>
      <h2>Stack recommender</h2>
      <form className="stack-form" onSubmit={(e) => { e.preventDefault(); submit(draft); }}>
        <label htmlFor="stack-description" className="sr-only">Describe your project</label>
        <textarea id="stack-description" rows={3} maxLength={500} value={draft}
          placeholder="Describe what you're building, e.g. “a marketplace web app with payments, in TypeScript”"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(draft); } }} />
        <div className="stack-form-row">
          <label>Type
            <select value={params.archetype ?? ""} onChange={(e) => onParamsChange({ ...params, archetype: e.target.value || null, overrides: {} })}>
              <option value="">Auto</option>
              {ARCHETYPES.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </label>
          <label>Language
            <select value={params.language ?? ""} onChange={(e) => onParamsChange({ ...params, language: e.target.value || null, overrides: {} })}>
              <option value="">Auto</option>
              {SLOTS_BY_ID.get("language")!.candidates.map((s) => index.node(s)).filter(Boolean).map((n) =>
                <option key={n!.slug} value={n!.slug}>{n!.label}</option>)}
            </select>
          </label>
          <button type="submit" className="stack-go">Recommend</button>
        </div>
      </form>
      {currentLabel && current.length > 0 && <p className="stack-note">Starting from <strong>{currentLabel}</strong>: {current.length} technologies already detected. Suggestions fill the gaps.</p>}
      {!rec && <div className="stack-examples">
        <p>Every suggestion cites the atlas relationships behind it. Try one:</p>
        {EXAMPLES.map((e) => <button key={e} type="button" onClick={() => submit(e)}>{e}</button>)}
      </div>}
      {rec && <>
        <p className="stack-archetype"><strong>{rec.archetype.label}.</strong> {rec.archetypeReason}</p>
        <ol className="stack-picks">
          {rec.picks.map((p) => {
            const key = p.slot.id;
            const expanded = open === key;
            const lead = p.reasons.find((r) => r.kind === "edge") ?? p.reasons[0];
            return (
              <li key={key} className={`stack-pick is-${p.source}`}>
                <div className="stack-pick-head">
                  <span className="stack-slot">{p.slot.label}</span>
                  <button type="button" className="stack-tech" onClick={() => onPick(p.node.id)} title={`Open ${p.node.label} on the atlas`}>{p.node.label}</button>
                  <span className="stack-source">{SOURCE_LABEL[p.source]}</span>
                </div>
                <button type="button" className="stack-why" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : key)}
                  title={expanded ? "Hide details" : "Why this, and what else fits"}>
                  <span>{lead?.text ?? "Details"}</span>
                  <span className="stack-chevron" aria-hidden>{expanded ? "▴" : p.alternatives.length ? `+${p.alternatives.length} ▾` : "▾"}</span>
                </button>
                {expanded && <div className="stack-detail">
                  <p className="muted">{p.slot.role}</p>
                  {p.reasons.length > 1 && <ul>{p.reasons.filter((r) => r !== lead).map((r) => <li key={r.text}>{r.text}</li>)}</ul>}
                  {p.alternatives.length > 0 && <div className="stack-alts">
                    <span>Swap for:</span>
                    {p.alternatives.map((a) => <button key={a.id} type="button" title={`Use ${a.label} for ${p.slot.label.toLowerCase()} instead`}
                      onClick={() => onParamsChange({ ...params, overrides: { ...params.overrides, [key]: a.slug } })}>{a.label}</button>)}
                  </div>}
                </div>}
              </li>
            );
          })}
        </ol>
        {rec.extras.length > 0 && <p className="stack-note">Also in your description: {rec.extras.map((n, i) =>
          <span key={n.id}>{i > 0 && ", "}<button type="button" className="stack-inline" onClick={() => onPick(n.id)}>{n.label}</button></span>)}.</p>}
        {rec.concepts.length > 0 && <>
          <h3>Concepts this stack leans on</h3>
          <div className="stack-concepts">{rec.concepts.map((c) =>
            <button key={c.node.id} type="button" onClick={() => onPick(c.node.id)} title={`Connected to ${c.via.map((v) => v.label).join(", ")}`}>{c.node.label}</button>)}</div>
        </>}
        <div className="compare-actions stack-actions">
          <button type="button" onClick={() => copy("link")}>{copied === "link" ? "Link copied" : "Copy link"}</button>
          <button type="button" onClick={() => copy("md")}>{copied === "md" ? "Copied" : "Copy as Markdown"}</button>
          {Object.keys(params.overrides).length > 0 && <button type="button" onClick={() => onParamsChange({ ...params, overrides: {} })}>Reset swaps</button>}
          {EXPLAIN_ENABLED && <button type="button" onClick={runExplain} disabled={explain.state === "loading"}>
            {explain.state === "loading" ? "Asking Claude…" : "Explain with Claude"}</button>}
        </div>
        {explain.state === "done" && <div className="stack-explain" aria-live="polite"><h3>Claude's take</h3>
          {explain.text.split(/\n{2,}/).map((para, i) => <p key={i}>{para}</p>)}
          <p className="muted">Written by Claude from the relationships above only.</p></div>}
        {explain.state === "error" && <p className="stack-note" role="status">{explain.text}</p>}
      </>}
    </section>
  );
}
