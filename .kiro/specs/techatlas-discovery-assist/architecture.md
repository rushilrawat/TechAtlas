# Architecture — TechAtlas Discovery-Assist Tool

**Status:** Proposal for review. Complements `docs/architecture.md`. No code authorized.

## 1. Guiding constraint

"Automate the research, not the judgment." The tool is an **offline, build-time**
discovery aid that produces *reviewable proposals*. The human + the existing curated commit
path (`scripts/expand/_apply.py` → `scripts/validate_dataset.py`) remain the only way data
reaches `data/seed/`. Nothing here touches the API request path.

## 2. Where it sits

```
  AUTHORITATIVE SOURCES                 OFFLINE TOOL (scripts/discover/)
  ┌───────────────────┐
  │ Wikidata (SPARQL) │──┐
  └───────────────────┘  │   ┌──────────┐   ┌──────────┐   ┌───────────────────────┐
  ┌───────────────────┐  ├──►│ discover │──►│  dedup   │──►│ enrich (verifiable     │
  │ GitHub / npm /    │  │   │ (fetch)  │   │ vs graph │   │ facts only) + stage    │
  │ PyPI (optional)   │──┘   └──────────┘   └──────────┘   └───────────┬───────────┘
  └───────────────────┘                                                │
                                                                       ▼
                                              data/discovery/candidates.json  (gitignored)
                                                 status: NEEDS_REVIEW
                                                                       │
                                               ── HUMAN REVIEW & EDIT ──  (add domain + edges)
                                                                       │ status: APPROVED
                                                                       ▼
                                   promote.py ──► scripts/expand/_apply.py  (dedup + edge
                                                   endpoint pre-check, the SAME gate)
                                                                       │
                                                                       ▼
                                   data/seed/*.json ─build─►validate(--require-targets)─►layout
```

## 3. Components (`scripts/discover/`)

| Component | Responsibility | Boundary rule |
|-----------|----------------|---------------|
| `sources/wikidata.py` | SPARQL query for entity classes → raw candidates with wikidata_id, label, website, enwiki title | structured source only; injected client |
| `sources/registries.py` (optional) | reuse Phase 1D github/packages fetchers to surface popular-but-missing repos/packages | offline; fixture-tested |
| `dedup.py` | drop candidates already in the graph (id / (type,slug) / wikidata_id / normalized alias) and self-collisions | uses validator's normalization rule |
| `enrich.py` | fill only source-backed fields; derive schema-valid slug/id; leave domain + edges blank + flag | never invents classification/edges |
| `discover.py` | orchestrator → writes `data/discovery/candidates.json` with provenance + status | never writes `data/seed/` |
| `promote.py` | take APPROVED+complete candidates → `_apply.py`; refuse incomplete | reuses existing guardrails |

## 4. Data contract — `data/discovery/candidates.json`

```jsonc
{
  "generated_at": "2026-10-30T00:00:00Z",
  "sources": ["wikidata"],
  "candidates": [
    {
      "status": "NEEDS_REVIEW",            // NEEDS_REVIEW | APPROVED
      "node": {
        "id": "technology:bun",            // derived, schema-valid
        "slug": "bun",
        "name": "Bun",
        "node_type": "technology",
        "node_subtype": "runtime",         // set only if source class mapped cleanly, else null
        "primary_domain": null,            // HUMAN decides
        "short_description": "…",          // draft from source, marked unverified
        "official_url": "https://bun.sh",
        "wikipedia_title": "Bun (software)",
        "wikidata_id": "Q…"
      },
      "edges": [],                          // HUMAN supplies typed edges
      "review": { "needs": ["primary_domain", "edges"], "subtype_confident": true },
      "provenance": {
        "source": "wikidata",
        "source_ref": "https://www.wikidata.org/wiki/Q…",
        "retrieved_at": "2026-10-30T00:00:00Z",
        "description_source": "wikidata:description"
      }
    }
  ]
}
```

A candidate is **promotable** only when `status == APPROVED`, `primary_domain` is set, and
`edges` is non-empty — `promote.py` enforces this and then defers to `_apply.py`.

## 5. Reuse, not reinvention

- Dedup normalization mirrors `scripts/validate_dataset.py::_normalize`.
- Promotion defers entirely to `scripts/expand/_apply.py` (dedup + edge endpoint pre-check).
- Registry pass reuses `scripts/popularity/sources/{github,packages}.py`.
- Fixture-based, no-live-network testing mirrors Phase 1C/1D.

## 6. Security / integrity posture

- Source responses are untrusted: descriptions are drafts, never final; slugs are
  regex-validated; nothing is written to `data/seed/` without passing `_apply.py` + the
  validator.
- Offline/build-time only; not importable from `backend/app`.
- `data/discovery/` is gitignored (generated, source-derived), like `data/popularity.json`.

## 7. What this architecture deliberately refuses

Auto-insertion, auto-edges, auto-domain, new domains, and freeform web scraping — each would
undermine the "every node hand-verified" guarantee. The human review gate is the feature.
