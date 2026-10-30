# Deploying the Repo X-Ray scanner backend (Render Free)

The TechAtlas frontend stays on **GitHub Pages**. The Repo X-Ray scanner is a separate
**FastAPI HTTPS service** on **Render Free**. The frontend only shows Repo X-Ray once the
backend URL is wired in (build-time `VITE_SCANNER_API`); until then it stays hidden and the
public site is unchanged.

Nothing is live until you complete the manual steps below — code/config are prepared and
tested, but the Render account, the GitHub token, and the one GitHub Actions variable are
yours to set.

## What is already in the repo

- `backend/Dockerfile` — single-worker uvicorn on `0.0.0.0:$PORT`, non-root, copies the
  app + `data/graph.json` + `data/layout.json` + `scripts/sizing.py` only.
- `backend/requirements.txt` — pinned runtime deps (no dev/test deps).
- `render.yaml` — Render blueprint (Docker, free plan, health check `/health`).
- `.dockerignore` — keeps the image lean.
- Production safeguards in the backend (rate limit, concurrency, deadline, bounded store,
  strict CORS, clean errors) — see "Safeguards".
- `.github/workflows/deploy-pages.yml` injects `VITE_SCANNER_API` from the repo variable
  `SCANNER_API_URL` at build time.

## Manual steps (do these in order)

### 1. Create a GitHub token (server-side only)
- GitHub → Settings → Developer settings → Personal access tokens → Fine-grained token.
- Access: **Public repositories (read-only)** is sufficient (the scanner only reads public
  repos). No other scopes.
- Copy the token. **Never** put it in the frontend, the repo, or a GitHub Pages variable.

### 2. Create the Render service
- Render dashboard → **New → Blueprint** → connect the GitHub repo `rushilrawat/TechAtlas`.
- Render reads `render.yaml` and proposes a web service **techatlas-scanner** (Docker, free).
- Root directory: leave as the repo root (the Dockerfile uses `dockerContext: .`).
- Build/start: handled by the Dockerfile (no manual command needed).
- Health check path: `/health` (already in the blueprint).

### 3. Set the backend environment variables (Render dashboard → the service → Environment)
| Variable | Value | Notes |
|---|---|---|
| `GITHUB_TOKEN` | your token from step 1 | **secret**; server-side only |
| `TECHATLAS_CORS_ORIGINS` | `https://rushilrawat.github.io` | the Pages origin (no path, no trailing slash) |
| `TECHATLAS_SCAN_MAX_CONCURRENT` | `2` | optional (default 2) |
| `TECHATLAS_SCAN_DEADLINE_SEC` | `45` | optional (default 45) |
| `TECHATLAS_SCAN_RATE_PER_MIN` | `5` | optional (default 5/min/IP, burst 5) |

Deploy. When it is live, note the HTTPS URL, e.g. `https://techatlas-scanner.onrender.com`.

### 4. Verify the backend directly (before touching the frontend)
```
curl https://techatlas-scanner.onrender.com/health
# => {"status":"ok","version":"0.2.0","scanner_token_configured":true,"active_scans":0}
```
`scanner_token_configured` MUST be `true`. (The first request after idle takes ~30-60s.)

### 5. Point the frontend at the backend (build-time)
- GitHub repo → Settings → Secrets and variables → Actions → **Variables** tab → New
  repository variable:
  - Name: `SCANNER_API_URL`
  - Value: `https://techatlas-scanner.onrender.com/api/v1`  (note the `/api/v1` suffix)
- Re-run the **Deploy to GitHub Pages** workflow (or push any commit to `main`).
- The next build injects `VITE_SCANNER_API` and the Repo X-Ray button appears on
  https://rushilrawat.github.io/TechAtlas/.

### 6. End-to-end verification on the live site (required before calling it done)
Open https://rushilrawat.github.io/TechAtlas/ and confirm:
- [ ] "Repo X-Ray" button is visible.
- [ ] Submitting `https://github.com/pallets/flask` starts a scan (allow up to ~1 min on a
      cold start; the panel says it may be waking up).
- [ ] The backend completes a REAL scan (not mocked) — detected nodes light up.
- [ ] Clicking a detected node opens its panel with "Found in this repository" evidence; an
      evidence link opens the correct GitHub file at the analyzed commit.
- [ ] "Focus Stack" reframes the detected nodes.
- [ ] "Back to Universe" restores the normal graph.
- [ ] An invalid URL shows a clear error; hammering scans shows a 429/busy message.

## Safeguards (already implemented)

- **Rate limiting:** per-IP token bucket (default burst 5, ~5/min). Returns **429** with
  `retry_after_seconds`. Behind Render's proxy the leftmost `X-Forwarded-For` hop is used;
  a spoofed header only changes the bucket, it cannot bypass the global concurrency gate.
- **Concurrency:** global gate (default 2). When full, returns **503** `busy` immediately
  (no queueing/hanging).
- **Wall-clock deadline:** ~45s per scan; past it, the scan returns a `partial` result.
- **Budgets:** ≤60 GitHub requests, ≤300 files, ≤120 source files, ≤256 KB/file.
- **Bounded store:** completed scans held in a TTL+size-capped in-memory store (1h / 500).
- **Strict URL validation:** GitHub owner/repo only; no SSRF, no cross-host redirects.
- **CORS:** restricted to `TECHATLAS_CORS_ORIGINS`; headers limited to `content-type`.
  (CORS is a browser guardrail, not authentication; the limits above are the real backstop.)
- **No code execution:** static analysis only; no clone, no install, no scripts.

**Single-worker requirement:** the rate limiter / concurrency gate / store are in-process
and per-instance. They reset on restart and do NOT coordinate across workers or instances.
The Dockerfile runs **one** uvicorn worker; do not raise the worker count or scale to
multiple instances without replacing these with a shared store (e.g. Redis).

## Cache & storage

On-disk JSON cache (`data/cache/scans/`, atomic writes) keyed by repo+commit+scanner+
mapping version. Render's filesystem is **ephemeral** — the cache is best-effort and is lost
on redeploy/restart; the app works fine without it (a miss just re-scans). No database, no
persistent disk required.

## Free-tier limitations

- **Cold starts:** the service sleeps after ~15 min idle; the first request then takes
  ~30-60s. The frontend waits up to ~90s and shows a "waking up" state (no fake progress).
- **Shared throughput:** unauthenticated-style single instance; fine for demo traffic, not
  for heavy concurrent load.
- **Rate-limit reset on restart:** limits are per-instance and reset when the dyno recycles.
- **GitHub API:** with a token, 5000 req/hr. A scan uses ~10-30 requests.

## Monitoring

- Health: `GET /health` (used by Render's health check). Reports `status`, dataset
  `version`, `scanner_token_configured`, and `active_scans`.
- Logs: Render dashboard → the service → Logs.
