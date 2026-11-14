import { useEffect, useMemo, useRef, useState } from "react";
import {
  EMPTY_PATH_FILTER, QUICK_MAX_STEPS, featuredPaths, filterPaths, pathFields, pathStatus,
  type PathEntry, type PathFilter,
} from "../graph/pathsLibrary";

interface Props {
  entries: PathEntry[];
  done: Set<string>;
  progress: Record<string, number>;
  /** Index of the path being followed, if any. */
  activeIndex: number | null;
  onStart: (index: number) => void;
  onClose: () => void;
}

/**
 * Every guided path as a browsable, filterable library: search across titles and steps,
 * narrow by field, length or progress, and start a path in one click. Replaces the
 * 145-option <select>.
 */
export function PathsLibrary({ entries, done, progress, activeIndex, onStart, onClose }: Props) {
  const [filter, setFilter] = useState<PathFilter>(EMPTY_PATH_FILTER);
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    // Capture phase so the search box and other panels cannot swallow Escape.
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const fields = useMemo(() => pathFields(entries), [entries]);
  const featured = useMemo(() => featuredPaths(entries), [entries]);
  const results = useMemo(() => filterPaths(entries, filter, done, progress), [entries, filter, done, progress]);
  const filtering = JSON.stringify(filter) !== JSON.stringify(EMPTY_PATH_FILTER);
  const doneCount = entries.filter((e) => done.has(e.title)).length;
  const set = (patch: Partial<PathFilter>) => setFilter((f) => ({ ...f, ...patch }));

  return (
    <div className="paths-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="paths-library" role="dialog" aria-modal="true" aria-labelledby="paths-title">
        <header className="paths-head">
          <div>
            <h2 id="paths-title">Guided paths</h2>
            <p className="paths-sub">
              {entries.length} short tours through the atlas, a few steps each.
              {doneCount > 0 && <> You&rsquo;ve finished <strong>{doneCount}</strong>.</>}
            </p>
          </div>
          <button type="button" className="outline-close" onClick={onClose} aria-label="Close paths">×</button>
          <div className="paths-controls">
            <input ref={inputRef} type="search" className="paths-search" placeholder="Search paths or topics, e.g. Kubernetes"
              aria-label="Search guided paths" value={filter.query} onChange={(e) => set({ query: e.target.value })} />
            <select aria-label="Field" value={filter.field} onChange={(e) => set({ field: e.target.value })}>
              <option value="">All fields</option>
              {fields.map((f) => <option key={f.id} value={f.id}>{f.name} ({f.count})</option>)}
            </select>
            <Segmented label="Length" value={filter.length} onChange={(v) => set({ length: v })}
              options={[["all", "Any length"], ["quick", `Quick (≤${QUICK_MAX_STEPS})`], ["deep", "Deeper"]]} />
            <Segmented label="Progress" value={filter.status} onChange={(v) => set({ status: v })}
              options={[["all", "All"], ["new", "Not started"], ["started", "In progress"], ["done", "Done"]]} />
          </div>
        </header>

        <div className="paths-body">
          {!filtering && featured.length > 0 && (
            <section aria-labelledby="paths-featured">
              <h3 id="paths-featured" className="paths-section">Start here</h3>
              <ul className="paths-grid paths-featured">
                {featured.map((e) => <PathCard key={e.slug} entry={e} featured done={done} progress={progress}
                  active={activeIndex === e.index} onStart={onStart} />)}
              </ul>
            </section>
          )}
          <section aria-labelledby="paths-all">
            <h3 id="paths-all" className="paths-section" aria-live="polite">
              {filtering ? `${results.length} matching ${results.length === 1 ? "path" : "paths"}` : "All paths"}
              {filtering && <button type="button" className="paths-clear" onClick={() => setFilter(EMPTY_PATH_FILTER)}>Clear filters</button>}
            </h3>
            {results.length === 0 ? (
              <p className="paths-empty">No paths match. Try another word or clear the filters.</p>
            ) : (
              <ul className="paths-grid">
                {results.map((e) => <PathCard key={e.slug} entry={e} done={done} progress={progress}
                  active={activeIndex === e.index} onStart={onStart} />)}
              </ul>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}

function Segmented<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: [T, string][]; onChange: (v: T) => void;
}) {
  return (
    <div className="paths-seg" role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>{text}</button>
      ))}
    </div>
  );
}

function PathCard({ entry, done, progress, active, featured = false, onStart }: {
  entry: PathEntry; done: Set<string>; progress: Record<string, number>; active: boolean;
  featured?: boolean; onStart: (index: number) => void;
}) {
  const status = pathStatus(entry, done, progress);
  const reached = status === "done" ? entry.stepCount : Math.min((progress[entry.slug] ?? 0) + 1, entry.stepCount);
  const preview = entry.labels.length > 4
    ? [...entry.labels.slice(0, 3), "…", entry.labels[entry.labels.length - 1]]
    : entry.labels;
  return (
    <li>
      <button type="button" className={`path-card${featured ? " is-featured" : ""}${active ? " is-active" : ""}`}
        onClick={() => onStart(entry.index)}
        aria-label={`${entry.title}, ${entry.stepCount} steps, ${entry.fieldName}${status === "done" ? ", finished" : status === "started" ? ", in progress" : ""}`}>
        <span className="path-field"><span className="path-dot" style={{ background: entry.color }} aria-hidden />{entry.fieldName}</span>
        <span className="path-title">{entry.title}</span>
        <span className="path-steps">{preview.join(" → ")}</span>
        <span className="path-meta">
          <span>{entry.stepCount} steps</span>
          {status === "done" && <span className="path-badge is-done">✓ Done</span>}
          {status === "started" && <span className="path-badge">Step {reached} of {entry.stepCount}</span>}
          {active && <span className="path-badge is-active">Following</span>}
        </span>
        {status !== "new" && (
          <span className="path-progress" aria-hidden><span style={{ width: `${(reached / entry.stepCount) * 100}%` }} /></span>
        )}
      </button>
    </li>
  );
}
