# Seed dataset — honest status

This is the curated TechAtlas dataset. As of the **Phase 1B expansion (dataset version
`0.2.0`)** it meets the master-spec breadth targets: **250+ technologies and 150–170
concepts**. The validator prints the exact live counts on every run — trust those numbers,
not any figure written in prose here.

The spec explicitly prefers a verified dataset over a larger unreliable one, and forbids
claiming a catalog exists just because it was listed. Every node added during the 1B
expansion was hand-authored with a real classification and, where one exists, a real
Wikipedia/Wikidata identity.

## What's here

The seed is assembled from the fragment files in this directory and compiled into a
single validated `graph.json` by `scripts/build_dataset.py`.

- `domains.json`      — the major domain communities (visual anchors)
- `concepts.json`     — fundamental concepts / terms / protocols / standards
- `technologies.json` — concrete languages, frameworks, libraries, tools, platforms
- `edges.json`        — typed relationships between all of the above

Run `python scripts/build_dataset.py` to compile and `python scripts/validate_dataset.py`
to verify. The validator prints the exact live counts — trust those numbers, not this doc.

## Expansion path

New entities are added by appending to the fragment files and re-running build +
validate. The schema and API do not change as the dataset grows. Each addition must be
hand-verified (official URL, correct classification, correct Wikipedia/Wikidata identity
where one exists).

The 1B expansion was authored in domain batches via the provenance generators in
`scripts/expand/` (one module per domain batch, each merging only curated literals through
`scripts/expand/_apply.py`, which refuses duplicate ids/edges and pre-checks every edge's
endpoint rules before writing). The milestone counts are gated in CI with
`python scripts/validate_dataset.py --require-targets`.

The **discovery-assist** tool (`scripts/discover/`, `make discover`) can *propose* new
technologies from authoritative structured sources (Wikidata, optionally popular
repos/packages), but it only writes a reviewable staging file — it never edits these
fragments directly and never invents a node's domain or relationships. A human reviews,
completes (domain + typed edges), and approves each candidate; `make promote` then routes
it through the same `_apply.py` + validator gate as a manual batch. Discovery proposes;
humans curate.
