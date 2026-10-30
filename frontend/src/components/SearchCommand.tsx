import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import type { SearchResult } from "../api/types";
import { nodeTypeLabel } from "../graph/relationships";

interface Props {
  onPick: (slugOrId: string) => void;
}

/**
 * Global search. Fully keyboard-accessible (spec §14.2): arrow keys move through
 * results, Enter selects, Escape clears. Debounced to avoid a request per keystroke.
 */
export function SearchCommand({ onPick }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const handle = window.setTimeout(() => {
      api
        .search(q, controller.signal)
        .then((r) => {
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

  function pick(r: SearchResult) {
    onPick(r.slug);
    setOpen(false);
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
        aria-expanded={open}
        aria-controls="search-results"
        autoComplete="off"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {open && results.length > 0 && (
        <ul id="search-results" className="search-results" role="listbox">
          {results.map((r, i) => (
            <li
              key={r.id}
              role="option"
              aria-selected={i === active}
              className={i === active ? "search-item active" : "search-item"}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(r);
              }}
            >
              <span className="search-item-name">{r.name}</span>
              <span className="search-item-meta">
                {nodeTypeLabel(r.node_type, r.node_subtype)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
