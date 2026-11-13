import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import type { SearchResult } from "../api/types";
import { nodeTypeLabel } from "../graph/relationships";

interface Props {
  onPick: (slugOrId: string) => void;
  /** Domain id -> name + colour, for the chip on each result. */
  domainsById?: Map<string, { name: string; color: string }>;
  /** Resolve a node id to a result row (recent picks and starting points on an empty query). */
  lookup?: (id: string) => SearchResult | null;
}

const RECENT_KEY = "techatlas-recent-search";
const STARTERS = [
  "technology:react",
  "technology:kubernetes",
  "concept:large-language-models",
  "technology:postgresql",
  "concept:retrieval-augmented-generation",
  "technology:rust",
];

function readRecent(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 5) : [];
  } catch {
    return [];
  }
}

function pushRecent(id: string) {
  try {
    const next = [id, ...readRecent().filter((x) => x !== id)].slice(0, 5);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

/**
 * Global search. Fully keyboard-accessible (spec §14.2): arrow keys move through
 * results, Enter selects, Escape clears. Debounced to avoid a request per keystroke.
 */
export function SearchCommand({ onPick, domainsById, lookup }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  // True while the list shows recent picks / starting points rather than matches.
  const [suggesting, setSuggesting] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // The value just chosen from the dropdown; skip the next search so picking a
  // result doesn't reopen the list 180ms later.
  const justPickedRef = useRef<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      if (!suggesting) setResults([]);
      return;
    }
    if (q === justPickedRef.current) {
      // We set the query to a picked result's name; don't search for it again.
      return;
    }
    const controller = new AbortController();
    const handle = window.setTimeout(() => {
      api
        .search(q, controller.signal)
        .then((r) => {
          setSuggesting(false);
          setResults(r);
          setActive(0);
          setOpen(true);
        })
        .catch((err) => {
          if (err.name !== "AbortError") setResults([]);
        });
    }, 180);
    return () => {
      controller.abort();
      window.clearTimeout(handle);
    };
  }, [query]);

  // "/" focuses search from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function showSuggestions() {
    if (!lookup) return;
    const ids = [...readRecent(), ...STARTERS.filter((id) => !readRecent().includes(id))];
    const rows = ids.map(lookup).filter((r): r is SearchResult => r !== null).slice(0, 8);
    if (rows.length === 0) return;
    setSuggesting(true);
    setResults(rows);
    setActive(0);
    setOpen(true);
  }

  function pick(r: SearchResult) {
    pushRecent(r.id);
    onPick(r.slug);
    justPickedRef.current = r.name;
    setOpen(false);
    setResults([]);
    setQuery(r.name);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(results[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="search" role="search">
      <input
        ref={inputRef}
        type="text"
        className="search-input"
        placeholder="Search technologies, concepts, domains…  ( / )"
        aria-label="Search the technology graph"
        role="combobox"
        aria-expanded={open}
        aria-controls="search-results"
        aria-autocomplete="list"
        aria-activedescendant={
          open && results.length > 0 ? `search-opt-${active}` : undefined
        }
        autoComplete="off"
        value={query}
        onChange={(e) => {
          // Any manual edit clears the just-picked guard so re-typing searches again.
          justPickedRef.current = null;
          setQuery(e.target.value);
          if (!e.target.value.trim()) showSuggestions();
          else if (suggesting) {
            // Typing replaces the suggestions; real matches arrive after the debounce.
            setSuggesting(false);
            setResults([]);
            setOpen(false);
          }
        }}
        onFocus={() => {
          if (!query.trim()) showSuggestions();
          else if (results.length) setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {open && results.length > 0 && (
        <ul id="search-results" className="search-results" role="listbox"
          aria-label={suggesting ? "Recent and suggested" : "Search results"}>
          {suggesting && <li className="search-group" role="presentation">Recent and suggested</li>}
          {results.map((r, i) => {
            const dom = domainsById?.get(r.node_type === "domain" ? r.id : r.primary_domain);
            return (
            <li
              key={r.id}
              id={`search-opt-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? "search-item active" : "search-item"}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(r);
              }}
            >
              <span className="search-item-dot" style={{ background: dom?.color ?? "var(--text-dim)" }} aria-hidden />
              <span className="search-item-name">{r.name}</span>
              <span className="search-item-meta">
                {nodeTypeLabel(r.node_type, r.node_subtype)}
                {dom && r.node_type !== "domain" ? ` · ${dom.name}` : ""}
                {r.matched_on === "fuzzy" ? " · did you mean?" : ""}
              </span>
            </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
