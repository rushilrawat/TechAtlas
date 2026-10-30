# Known issues

Tracked low-severity items not yet fixed. Production-breaking and confirmed
interaction/security bugs from the Phase 1 audit have been fixed (see git history);
this file lists what was deliberately deferred.

## Data quality (dataset is valid; these are editorial)

- **36 weakly-connected nodes.** Some concept nodes connect only to their domain via
  `belongs_to_domain` (e.g. `concept:cap-theorem`, `concept:overfitting`,
  `concept:webhooks`). They render as near-isolated bubbles. Fix: hand-curate richer
  typed edges for these concepts. Low priority; they are valid, just sparse.
- **Shared Wikipedia title.** `technology:spring-boot` and `technology:spring` both use
  the "Spring Framework" article, so both show the same summary. Fix: give Spring Boot a
  distinct curated title or none.
- **`technology:assembly` official_url** points at a Wikipedia page rather than an
  official site (assembly language has no single vendor). Acceptable but imperfect.
- **`technology:tailwind` id ≠ slug** (`id technology:tailwind`, slug `tailwind-css`).
  Harmless now that the frontend resolves detail files by canonical slug, but the id/slug
  mismatch is a latent footgun. A future dataset-version bump could rename the id to
  `technology:tailwind-css` for consistency (would require a coordinated id change).

## summary_service (Phase 1C)

- A stale on-disk summary served after a failed refetch is placed in the in-process LRU,
  which does not re-check age, so that entry won't be refreshed again for the life of the
  process. Low impact (bounded by process lifetime; TTL still applies on restart).
- Failed Wikipedia fetches are not negatively cached, so a node whose title 404s costs a
  short (~3s-bounded) request on each view until a summary exists. Low impact.

## Scoring (Phase 1D)

- `score._normalize_metric` assigns 1.0 to every technology when all values for a metric
  are equal (e.g. all zero). Edge case; does not occur with real sourced data where values
  differ. Documented so it isn't mistaken for a real top score.

## Discovery auto-ingest

- A missing Wikidata description falls back to `"<Name>."` and is truncated at 280 chars
  without an ellipsis (unlike the review-path `enrich.py`). Only affects the hands-off
  weekly PR, which is human-reviewed before merge.
- The SPARQL query uses `LIMIT` without `ORDER BY`, so each run may return a different
  arbitrary subset per class. Acceptable for a discovery aid; results are deduped by QID.

## CI / tooling

- GitHub Actions emits Node 20 deprecation warnings for several official actions. Not
  failing; will be addressed when the actions publish Node 24 versions.
