// Repo X-Ray scanner client (Phase 1.5B).
//
// The scanner needs a live FastAPI backend (GitHub calls + token + cache), which the
// static GitHub Pages build does NOT have. So it is gated behind VITE_SCANNER_API:
//   - unset  -> scanner disabled; the Repo X-Ray entry point is hidden.
//   - set    -> base URL of a reachable scanner backend (e.g. "/api/v1" via the dev
//               proxy, or "https://scanner.example.com/api/v1" for a hosted backend).

import type { RepoScan, ScanErrorBody } from "./types";

const RAW = import.meta.env.VITE_SCANNER_API;
export const SCANNER_ENABLED = typeof RAW === "string" && RAW.trim().length > 0;
const SCANNER_BASE = (RAW ?? "").replace(/\/$/, "");

// Render Free sleeps when idle (~30-60s cold start); the backend scan deadline is ~45s.
// Give the request up to ~90s before giving up, so a waking service isn't cut off, while
// never hanging forever. The caller's AbortSignal (repo switch / unmount) still wins.
const SCAN_TIMEOUT_MS = 90_000;

function withTimeout(signal: AbortSignal | undefined, ms: number): {
  signal: AbortSignal;
  done: () => void;
} {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new DOMException("timeout", "TimeoutError")), ms);
  const onAbort = () => ctrl.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) ctrl.abort(signal.reason);
    else signal.addEventListener("abort", onAbort, { once: true });
  }
  return {
    signal: ctrl.signal,
    done: () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    },
  };
}

export class ScanError extends Error {
  code: string;
  retryAfterSeconds: number | null;
  constructor(body: ScanErrorBody) {
    super(body.message || "Scan failed.");
    this.code = body.error || "error";
    this.retryAfterSeconds = body.retry_after_seconds ?? null;
  }
}

async function parseError(res: Response): Promise<ScanError> {
  let body: ScanErrorBody = { error: "error", message: `Request failed (${res.status}).` };
  try {
    const json = await res.json();
    // FastAPI wraps HTTPException detail under {detail: {...}}.
    const detail = (json && typeof json === "object" && "detail" in json)
      ? (json as { detail: unknown }).detail
      : json;
    if (detail && typeof detail === "object" && "error" in detail) {
      body = detail as ScanErrorBody;
    } else if (res.status === 429) {
      body = { error: "rate_limited", message: "GitHub is temporarily limiting requests." };
    }
  } catch {
    /* non-JSON error body: keep the generic message */
  }
  return new ScanError(body);
}

export const scanner = {
  /**
   * Synchronous-with-cache: POST returns the full RepoScan (completed or partial), or
   * throws ScanError. Matches the Phase 1.5A contract (not a queued job).
   */
  async scan(repositoryUrl: string, signal?: AbortSignal): Promise<RepoScan> {
    if (!SCANNER_ENABLED) {
      throw new ScanError({ error: "disabled", message: "Scanner is not configured." });
    }
    const t = withTimeout(signal, SCAN_TIMEOUT_MS);
    try {
      const res = await fetch(`${SCANNER_BASE}/repository-scans`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ repository_url: repositoryUrl }),
        signal: t.signal,
      });
      if (!res.ok) throw await parseError(res);
      return (await res.json()) as RepoScan;
    } catch (e) {
      // Distinguish a timeout (likely cold start that never woke) from a user abort.
      if (e instanceof DOMException && e.name === "TimeoutError") {
        throw new ScanError({
          error: "timeout",
          message: "The scanner did not respond in time (it may be waking up). Try again.",
        });
      }
      throw e;
    } finally {
      t.done();
    }
  },

  async get(scanId: string, signal?: AbortSignal): Promise<RepoScan> {
    const res = await fetch(`${SCANNER_BASE}/repository-scans/${encodeURIComponent(scanId)}`, {
      signal,
    });
    if (!res.ok) throw await parseError(res);
    return (await res.json()) as RepoScan;
  },
};
