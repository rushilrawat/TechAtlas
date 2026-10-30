// Repo X-Ray scan state (Phase 1.5B). Owns the scan lifecycle and abort/race safety:
// switching repositories aborts the in-flight request and discards its result.

import { useCallback, useRef, useState } from "react";
import { ScanError, scanner } from "../api/scanner";
import type { RepoScan } from "../api/types";

export type ScanPhase =
  | { kind: "idle" }
  | { kind: "analyzing"; url: string }
  | { kind: "done"; scan: RepoScan } // completed OR partial (scan.status says which)
  | { kind: "error"; code: string; message: string; retryAfter: number | null };

export interface RepoScanController {
  phase: ScanPhase;
  analyze: (url: string) => void;
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

  const reset = useCallback(() => {
    abortRef.current?.abort();
    reqIdRef.current++; // invalidate any late response
    setPhase({ kind: "idle" });
  }, []);

  return { phase, analyze, reset };
}
