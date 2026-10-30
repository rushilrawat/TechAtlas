import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ScanError as ScanErrorType } from "./scanner";

// The scanner module reads VITE_SCANNER_API at import time, so stub it BEFORE importing.
let ScanError: typeof import("./scanner").ScanError;
let scanner: typeof import("./scanner").scanner;

beforeAll(async () => {
  vi.stubEnv("VITE_SCANNER_API", "/api/v1");
  const mod = await import("./scanner");
  ScanError = mod.ScanError;
  scanner = mod.scanner;
});

function mockFetch(status: number, body: unknown, ok = status < 400) {
  return vi.fn().mockResolvedValue({
    ok, status,
    json: async () => body,
  } as Response);
}

afterEach(() => vi.restoreAllMocks());

describe("scanner client", () => {
  it("POSTs the repository_url and returns the scan on success", async () => {
    const scan = { scan_id: "s1", status: "completed", detections: [] };
    const f = mockFetch(200, scan);
    vi.stubGlobal("fetch", f);
    const out = await scanner.scan("https://github.com/a/b");
    expect(out.scan_id).toBe("s1");
    const [url, init] = f.mock.calls[0];
    expect(String(url)).toContain("/repository-scans");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ repository_url: "https://github.com/a/b" });
  });

  it("maps a FastAPI detail error to a typed ScanError", async () => {
    vi.stubGlobal("fetch", mockFetch(404, {
      detail: { error: "not_found", message: "no repo" },
    }));
    await expect(scanner.scan("https://github.com/a/b")).rejects.toMatchObject({
      code: "not_found", message: "no repo",
    });
  });

  it("surfaces a rate-limit error with retry_after", async () => {
    vi.stubGlobal("fetch", mockFetch(429, {
      detail: { error: "rate_limited", message: "slow down", retry_after_seconds: 42 },
    }));
    try {
      await scanner.scan("https://github.com/a/b");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ScanError);
      expect((e as ScanErrorType).code).toBe("rate_limited");
      expect((e as ScanErrorType).retryAfterSeconds).toBe(42);
    }
  });

  it("handles a non-JSON error body gracefully", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false, status: 500, json: async () => { throw new Error("no json"); },
    } as unknown as Response));
    await expect(scanner.scan("https://github.com/a/b")).rejects.toBeInstanceOf(ScanError);
  });
});

describe("scanner cold-start resilience", () => {
  it("aborts with a timeout ScanError when the backend never responds", async () => {
    vi.useFakeTimers();
    // fetch that rejects when its signal aborts (simulates a hung/sleeping backend).
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () =>
          reject(init.signal?.reason ?? new DOMException("aborted", "AbortError")));
      })));
    const p = scanner.scan("https://github.com/a/b");
    const assertion = expect(p).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(90_001); // trip the 90s client timeout
    await assertion;
    vi.useRealTimers();
  });

  it("surfaces a network error when the backend is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(scanner.scan("https://github.com/a/b")).rejects.toBeTruthy();
  });

  it("propagates a caller abort (repo switch) without a timeout error", async () => {
    const ctrl = new AbortController();
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () =>
          reject(init.signal?.reason ?? new DOMException("aborted", "AbortError")));
      })));
    const p = scanner.scan("https://github.com/a/b", ctrl.signal);
    ctrl.abort(new DOMException("switch", "AbortError"));
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
  });
});
