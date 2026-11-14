# Known issues

Tracked low-severity items not yet fixed. Production-breaking and confirmed
interaction/security bugs from the Phase 1 audit have been fixed (see git history);
this file lists what was deliberately deferred.

## Data quality (dataset is valid; these are editorial)

- **`technology:assembly` official_url** points at a Wikipedia page rather than an
  official site (assembly language has no single vendor). Acceptable but imperfect.
- **`domain:blockchain` id ≠ slug** (slug `blockchain-web3`). The validator warns about it.
  Harmless because detail files and deep links resolve by slug; renaming a domain id
  touches layout, colours and share pages, so it is left as is.
- **308 nodes have exactly two typed relationships.** The validator requires two and
  reports the count below the target of three as a single warning.

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
