# Popularity data sources

Phase 1D ingests **public, source-attributed** popularity metrics. Every metric stored
in `data/popularity.json` records its `source`, `retrieved_at`, `license`, and the
`normalized` value, so no number is ever unattributed or invented. A technology with no
mapped source simply has **no score** (it is absent from the scores map), never zero.

A source may only be enabled after its license / terms are recorded here (reviewer
decision 2, 2026-10-29).

## Enabled sources

| Source | Metric(s) | Endpoint | Auth | License / Terms | Rate limits |
|--------|-----------|----------|------|-----------------|-------------|
| GitHub REST API | `github_stars`, `github_activity` (pushed-at recency) | `https://api.github.com/repos/{owner}/{name}` | Optional `GITHUB_TOKEN` (build-time only; higher rate limit) | [GitHub API Terms](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service) — factual counts, used with attribution | 60/hr unauthenticated, 5000/hr with a token |
| npm registry | `downloads` (npm, last 30 days) | `https://api.npmjs.org/downloads/point/last-month/{pkg}` | None | [npm registry is public](https://docs.npmjs.com/policies/terms); download counts are public stats | Be polite; no documented hard cap |
| PyPI (pypistats) | `downloads` (PyPI, last 30 days) | `https://pypistats.org/api/packages/{pkg}/recent` | None | [pypistats](https://pypistats.org/) public data (from the public PyPI BigQuery dataset) | Be polite |
| crates.io | `downloads` (crates, recent) | `https://crates.io/api/v1/crates/{name}` | None (required descriptive User-Agent) | [crates.io policy](https://crates.io/policies) | Descriptive `User-Agent` required |

## Not yet enabled

Other ecosystems present in the schema `package.ecosystem` enum (maven, nuget, rubygems,
packagist, go) are **not yet wired to a fetcher**. Technologies mapped to those ecosystems
simply have no download metric until a fetcher + this table entry are added. GitHub stars
still apply to them where a `repo` is mapped.

## Operating rules

- Ingestion is **offline / build-time only** — never in the API request path.
- Fetchers are tested against **recorded fixtures**; CI performs no live network calls.
- Raw fetched values are snapshotted (`data/popularity/raw/`) so scoring is reproducible.
- Request path: `GITHUB_TOKEN` (if present) is used only during ingestion and never stored
  in any artifact.
