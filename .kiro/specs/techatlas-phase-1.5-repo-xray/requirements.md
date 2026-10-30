# Requirements — TechAtlas Phase 1.5: Repo X-Ray

## Status

Requirements draft **for review**. No implementation is authorized by this document. It
restates the Phase 1.5 master specification as testable EARS criteria, grounded in the
actual TechAtlas codebase (audited below), and flags decisions that need confirmation.

## Repository audit (what Phase 1.5 builds on — verified, not assumed)

Per the spec's "audit first" instruction (§1, §28), these are the concrete facts the
design must respect:

- **Backend:** FastAPI under `backend/app/`, versioned routes at `/api/v1` in `main.py`.
  A narrow `GraphService` (`graph_service.py`) loads the validated JSON graph in memory;
  `SummaryService` (Phase 1C) is the pattern for an external-fetch service with an
  injectable client + two-tier cache. Pydantic models in `models.py`. 79 backend tests.
- **Data:** `data/graph.json` (v0.2.0): 251 technologies, 155 concepts, 11 domains.
  Technology nodes already carry, from Phase 1D, **`repo` ("owner/name")** on 146 nodes
  and **`package` ({ecosystem, name})** on 75 nodes (npm 38, pypi 34, + a few others),
  plus `aliases` on 73 nodes. `node_subtype` classifies each technology.
- **Frontend:** React + TS + Vite + Sigma.js. `GraphCanvas.tsx` owns the Sigma instance
  imperatively and already drives per-node/per-edge appearance through **reducers**
  (`nodeReducer`/`edgeReducer`) keyed off refs — the existing mechanism for
  filtering (Phase 1B) and hover/select dimming. `App.tsx` holds mode/selection state;
  `NodeDetailsPanel.tsx`, `FilterPanel.tsx`, `SearchCommand.tsx`, `DomainLegend.tsx` are
  the composable panels. `api/client.ts` is the typed API layer (now with a static mode
  for the Pages deploy). Deep links are base-path aware.
- **Hosting:** the frontend is deployed static to GitHub Pages. **Implication:** any
  feature that needs a live backend (the scanner does — GitHub calls, caching, secrets)
  only works against a running FastAPI instance, not the static Pages build. Requirement
  7 addresses how Repo X-Ray degrades on the static deployment.
- **Honesty doctrine** (carried through every phase): never fabricate data; show absence
  as absence; reuse the one canonical graph; keep generated/live-derived artifacts out of
  the committed, reproducible dataset.

## Decisions carried in from the spec (binding)

- Overlay, not a new graph: the scanner emphasizes a subset `S ⊆ V` of existing nodes; the
  base graph is never rebuilt or repositioned (spec §14.1).
- No LLM for detection; deterministic static analysis only (spec intro, §8.1, §25).
- Never execute repository code or install dependencies (spec §7.7, §17).
- GitHub token stays server-side; scans are bounded and cached by commit SHA (§7.5, §13).
- Reuse the existing node catalog + its `repo`/`package`/`aliases` for matching; never
  duplicate nodes or invent nodes/edges (spec §9, §14.4, §25).

---

## Requirement 1 — Repository input, validation, and canonical identity

**User story:** As a developer, I want to paste a public GitHub repo URL and have it
validated and resolved to an exact commit, so the scan is unambiguous and safe.

### Acceptance criteria (EARS)

1.1. WHEN a user submits a URL, THEN the system SHALL accept `https://github.com/owner/repo`,
`…/repo.git`, and trailing-slash variants, and SHALL normalize them to a canonical
`owner/repo` identity.

1.2. WHERE a URL is not a GitHub repo URL (other host, raw IP, local/private network
address, malformed owner/repo, arbitrary query-controlled host), the system SHALL reject it
**server-side** regardless of any client-side check (spec §4.3, §17).

1.3. WHEN validating owner/repo, THEN the system SHALL allow names containing dots, hyphens,
and underscores and SHALL NOT be more restrictive than GitHub's own naming rules.

1.4. WHEN a repository passes format validation, THEN the system SHALL confirm existence and
public accessibility via GitHub's API, and SHALL resolve the default branch to a specific
**commit SHA** used as the analyzed state's identity (spec §4.2, §7.2).

1.5. IF a URL embeds a branch or sub-directory path, THEN the system SHALL analyze the
default branch at the resolved commit and SHALL NOT treat the path as a distinct repo
(unless such support is explicitly added later) (spec §4.2).

---

## Requirement 2 — Deterministic technology detection with evidence

**User story:** As a user, I want technologies detected from real repository files with
traceable evidence, not guesses.

### Acceptance criteria (EARS)

2.1. WHEN scanning, THEN the system SHALL use GitHub's language statistics plus bounded
static inspection of manifests, lockfiles, config, and selected source files — and SHALL
NOT execute any repository code (spec §8, §7.7).

2.2. WHEN a technology is detected, THEN the system SHALL record one canonical detection per
technology with one or more **evidence items**, each carrying: node id, file path, evidence
type, short explanation, detection status, a commit-pinned GitHub source URL, and the
detection rule/scanner version (spec §6.2, §10.2).

2.3. WHERE evidence is a dependency manifest/lockfile only, the detection status SHALL be
`declared`; WHERE a source import/usage is found, it SHALL be `confirmed`; WHERE only a
pattern/config supports a concept, it SHALL be `inferred` (spec §5.4, §6.3, §10.1).

2.4. The system SHALL distinguish **direct** from **transitive** dependencies where the
manifest/lockfile format supports it, and SHALL NOT treat every lockfile package as directly
used (spec §8.3, §25).

2.5. The system SHALL support, for the MVP, at least: JS/TS (package.json + lockfiles +
configs + imports), Python (pyproject/requirements/poetry/uv/Pipfile + imports), Docker,
and GitHub Actions (spec §24). Additional ecosystems (Rust, Java/Kotlin, Go, …) SHALL be
added as independent parser modules that fail gracefully when absent (spec §8.8).

2.6. The system SHALL NOT fabricate detection confidence **percentages**; it SHALL use the
interpretable status categories only (spec §10.1).

2.7. WHERE evidence is only a README mention or a package name merely *containing* a known
term, the system SHALL NOT mark the technology confirmed (spec §9.2, §20.5, §25).

---

## Requirement 3 — Conservative concept inference

**User story:** As a user, I want engineering concepts (containerization, CI, ML, …) shown
only when evidence genuinely supports them.

### Acceptance criteria (EARS)

3.1. WHEN a concept is inferred, THEN it SHALL be backed by specific evidence (e.g. a
Dockerfile → `containerization`; a workflow file → `ci-cd`) and marked `inferred`
(spec §8.9, §8.10, §6.3).

3.2. The system SHALL NOT infer a concept from mere capability (e.g. an OpenAI SDK dependency
SHALL NOT by itself imply `retrieval-augmented-generation`; PyTorch SHALL NOT by itself imply
neural-network training) (spec §8.12, §25).

3.3. The system SHALL NOT infer a deployment platform from configuration presence (a
Dockerfile SHALL NOT imply AWS; a workflow SHALL NOT imply it passes) (spec §8.9, §6.3).

3.4. Inferred concepts SHALL map only to concept nodes that already exist in the graph; no
new concept nodes are created (spec §9.1, §14.4).

---

## Requirement 4 — Canonical matching against the existing graph (reuse, no duplication)

**User story:** As a maintainer, I want detected packages mapped to existing TechAtlas nodes
using the data we already have.

### Acceptance criteria (EARS)

4.1. WHEN mapping a detected package to a node, THEN the system SHALL resolve within the
package's **ecosystem** using the existing node `package` field ({ecosystem, name}),
`repo` field, and `aliases` — reusing the canonical catalog, not a second one (spec §9.1,
§9.4). *(The dataset already carries 75 package + 146 repo + 73 alias mappings from 1D.)*

4.2. WHEN resolving, THEN the system SHALL apply the priority order: exact
ecosystem-qualified package match → repo match → exact normalized name → approved alias →
reviewed heuristic → unmapped (spec §9.3).

4.3. The system SHALL NOT map by loose substring (a package whose name merely contains
"react" SHALL NOT auto-map to React) (spec §9.2).

4.4. WHERE a detected package has no matching node, THEN the system SHALL record it as an
**unmapped technology** (package name + ecosystem + evidence) and SHALL NOT fabricate or
auto-insert a node (spec §6.4, §14.4, §25).

4.5. WHERE the package-mapping data is incomplete for a common package, the mapping SHALL
be extendable via a shared, centrally-managed data file — not a hardcoded frontend
dictionary (spec §9.4).

---

## Requirement 5 — Graph overlay visualization (the core experience)

**User story:** As a user, I want the detected stack to light up on the existing graph
while the rest fades, without the graph being rebuilt.

### Acceptance criteria (EARS)

5.1. WHEN a scan completes, THEN the system SHALL emphasize detected nodes and dim unrelated
nodes/edges **via the existing Sigma reducers**, SHALL preserve each node's original domain
color, and SHALL convey detection status on a **separate visual channel** (outline/halo),
not by recoloring the node (spec §5.4, §14.3).

5.2. WHEN overlaying, THEN the system SHALL NOT recompute the layout, reposition nodes, or
mutate canonical node/edge data; scan state SHALL live in separate frontend state/refs
(spec §14.1, §14.3, §18, §25).

5.3. WHERE a detected node relates to another detected node by an **existing** edge, THEN
the system MAY highlight that edge; the system SHALL NOT invent edges to connect co-occurring
technologies (spec §5.6, §25).

5.4. WHEN results load, THEN the camera SHALL fit the matched nodes with reasonable padding
and readability, SHALL offer a "Focus on Stack" control, and SHALL respect
`prefers-reduced-motion`; a single reveal animation is allowed, indefinite pulsing is not
(spec §5.5, §5.7).

5.5. The system SHALL provide the **Universe Highlight View** (required). An **Isolated
Stack View** (filtered subgraph of the same data) MAY be added as an optional toggle
(spec §5.8).

5.6. WHEN the user exits Repo X-Ray ("Back to Universe"), THEN the system SHALL clear
highlighting, restore the pre-scan appearance and camera, close scan panels, and preserve
the underlying graph — without a page reload or graph rebuild (spec §4.6).

5.7. WHILE a scan is active, the user SHALL retain zoom/pan/select, and SHALL be able to
analyze a different repository without refreshing the app (spec §3, §4.5).

---

## Requirement 6 — Evidence inspector in the detail panel

**User story:** As a user, clicking a detected node tells me *why* the scanner thinks the
repo uses it.

### Acceptance criteria (EARS)

6.1. WHEN a detected node's detail panel opens during a scan, THEN it SHALL keep all existing
content (description, Wikipedia, docs, relationships, popularity) and add a **"Found in this
repository"** section listing classification, detection status, and evidence items
(spec §6.1).

6.2. WHERE an evidence item references a file, THEN it SHALL link to that file **at the
analyzed commit SHA** (not a mutable branch URL) (spec §6.1, §6.2).

6.3. WHEN describing evidence, THEN the panel SHALL use accurate language ("declared as a
dependency" vs "usage confirmed in source") and SHALL NOT overstate static conclusions
(spec §6.3).

6.4. WHERE a node is not part of the scan, THEN its panel SHALL show no repository section
(absence shown as absence).

---

## Requirement 7 — Scan lifecycle, bounds, caching, and failure handling (backend)

**User story:** As an operator, I want scans bounded, cached, and safe for a public app.

### Acceptance criteria (EARS)

7.1. WHEN a scan is requested, THEN the system SHALL return cached results for the same
`repo + commit_sha + scanner_version + mapping_version` when available, and otherwise run a
bounded scan (spec §13.2, §13.3).

7.2. WHEN scanning, THEN the system SHALL enforce budgets: bounded GitHub requests, bounded
concurrent scans, max files inspected, max per-file bytes, max total bytes, and a max scan
duration; and SHALL label the result **partial** when coverage is incomplete or the tree was
truncated — never silently claiming full coverage (spec §7.4, §18, §10.4).

7.3. WHEN GitHub communication occurs, THEN it SHALL be server-side with a server-held token
(never in the frontend), with rate-limit detection, bounded retries, and clear failure
responses (spec §7.5, §17).

7.4. WHILE reporting progress, THEN the system SHALL expose meaningful lifecycle states
(e.g. `queued`/`fetching`/`analyzing`/`matching`/`completed`/`partial`/`failed`) and SHALL
NOT fabricate progress percentages; an indeterminate indicator is used when fine-grained
progress is unavailable (spec §4.4, §12.3).

7.5. IF GitHub is unavailable or rate-limited, or the repo is empty/unsupported, THEN the
system SHALL return a clear, specific error and the rest of TechAtlas (Explore Mode) SHALL
remain fully functional (spec §16).

7.6. The system SHALL treat all repository-derived strings (paths, manifests, source) as
untrusted: no SSRF, no arbitrary-host fetch, no unsafe deserialization, no execution, bounded
parsing, and no surfacing/logging of likely secrets in committed files (spec §17).

7.7. WHERE the frontend is the **static GitHub Pages build** (no backend), Repo X-Ray SHALL
degrade gracefully — the entry point either hides or clearly states the scanner needs the
live backend — and SHALL NOT error the app. *(Open question: do we also ship a configurable
backend URL for the Pages build? See open questions.)*

---

## Requirement 8 — Does not disturb existing features

**User story:** As an existing user, Phase 1.5 must not break anything I already use.

### Acceptance criteria (EARS)

8.1. WHEN Phase 1.5 ships, THEN all existing Phase 0–1D behavior (graph render, search,
filters, detail panel, Wikipedia summaries, popularity sizing, deep links) SHALL still pass
its tests and work unchanged (spec §1, §24, §25).

8.2. The feature SHALL reuse the existing graph library, state approach, design system, and
API client; it SHALL NOT introduce a second graph, a duplicate node catalog, or a competing
visual identity (spec §5.1, §9.1, §14.1, §25).

8.3. All new backend endpoints/fields SHALL be additive and backward compatible; new
frontend surfaces SHALL be keyboard-accessible and responsive (desktop + mobile)
(spec §15, §24).

---

## Non-functional constraints

- NFR-1. Static analysis only; no code execution; no dependency installation.
- NFR-2. GitHub token server-side; anonymous scan submissions rate-limited.
- NFR-3. Overlay never mutates or relayouts the canonical graph.
- NFR-4. Fetchers tested against **mocked GitHub responses**; no live network in CI.
- NFR-5. Never fabricate detections, confidence %, progress %, edges, or nodes.
- NFR-6. Accurate, non-overstated language throughout ("declared" vs "confirmed", "not
  detected in analyzed files" vs "does not use").

---

## Open questions (need reviewer decision before design is final)

1. **Static-deploy strategy (R7.7):** the public site is static GitHub Pages with no
   backend. Options: (a) Repo X-Ray entry point is hidden on the static build; (b) the
   static build points at a separately-hosted live backend via a configurable URL
   (`VITE_SCANNER_API`); (c) accept that Repo X-Ray only runs in local/full-backend
   deployments for now. Design proposes (a)+(b): hide by default, enable when a scanner
   API URL is configured.
2. **Scan execution model (§12.4):** synchronous-with-cache for the MVP (simplest, fits the
   in-memory backend), or a bounded background job + polling? Design proposes
   synchronous-with-cache + short budgets for MVP, with the API shaped (scan_id + status)
   so it can move to background later without a client change.
3. **GitHub token for CI/prod:** confirm a `GITHUB_TOKEN` env is available to the backend in
   whatever environment actually runs scans (unauthenticated is 60 req/hr/IP — too low for
   real use). CI tests mock GitHub regardless.
4. **Cache storage:** reuse the Phase 1C on-disk JSON cache pattern (`data/cache/…`,
   gitignored) vs introducing SQLite. Design proposes the JSON-cache pattern for MVP
   (Option A consistency, no new infra).
5. **MVP scope of Isolated Stack View (§5.8 B):** required Universe Highlight View only for
   MVP, Isolated Stack View deferred — confirm.
