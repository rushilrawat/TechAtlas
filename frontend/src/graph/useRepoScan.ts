// Repo X-Ray scan state (Phase 1.5B). Owns the scan lifecycle and abort/race safety:
// switching repositories aborts the in-flight request and discards its result.

import { useCallback, useRef, useState } from "react";
import { ScanError, scanner } from "../api/scanner";
import { findExample, loadExampleScan } from "../api/exampleScans";
import type { RepoScan } from "../api/types";

export type ScanPhase =
  | { kind: "idle" }
  | { kind: "analyzing"; url: string }
  // completed OR partial (scan.status says which). `example` is the slug when the result
  // is a pre-computed example scan rather than a live one.
  | { kind: "done"; scan: RepoScan; example?: string }
  | { kind: "error"; code: string; message: string; retryAfter: number | null };

export interface RepoScanController {
  phase: ScanPhase;
  analyze: (url: string) => void;
  /** Load a pre-computed example scan (static JSON, no backend needed). */
  loadExample: (slug: string) => void;
  /** Show a scan that is already in hand (e.g. decoded from a share link). */
  load: (scan: RepoScan, example?: string) => void;
  reset: () => void;
}

export function useRepoScan(): RepoScanController {
  const [phase, setPhase] = useState<ScanPhase>({ kind: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const reqIdRef = useRef(0);

  const analyze = useCallback((url: string) => {
    // Abort any in-flight scan and invalidate its result (race safety).
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const myReq = ++reqIdRef.current;

    setPhase({ kind: "analyzing", url });
    scanner
      .scan(url, controller.signal)
      .then((scan) => {
        if (myReq !== reqIdRef.current) return; // superseded by a newer scan
        setPhase({ kind: "done", scan });
      })
      .catch((err) => {
        if (myReq !== reqIdRef.current) return;
        if (err?.name === "AbortError") return;
        if (err instanceof ScanError) {
          setPhase({
            kind: "error", code: err.code, message: err.message,
            retryAfter: err.retryAfterSeconds,
          });
        } else {
          setPhase({
            kind: "error", code: "network",
            message: "Could not reach the scanner backend.", retryAfter: null,
          });
        }
      });
  }, []);

  const loadExample = useCallback((slug: string) => {
    const meta = findExample(slug);
    if (!meta) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const myReq = ++reqIdRef.current;
    setPhase({ kind: "analyzing", url: `https://github.com/${meta.repo}` });
    loadExampleScan(slug, controller.signal)
      .then((scan) => {
        if (myReq !== reqIdRef.current) return;
        setPhase({ kind: "done", scan, example: slug });
      })
      .catch((err) => {
        if (myReq !== reqIdRef.current || err?.name === "AbortError") return;
        setPhase({ kind: "error", code: "example", message: "Could not load this example scan.", retryAfter: null });
      });
  }, []);

  const load = useCallback((scan: RepoScan, example?: string) => {
    abortRef.current?.abort();
    reqIdRef.current++;
    setPhase({ kind: "done", scan, example });
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    reqIdRef.current++; // invalidate any late response
    setPhase({ kind: "idle" });
  }, []);

  return { phase, analyze, loadExample, load, reset };
}
