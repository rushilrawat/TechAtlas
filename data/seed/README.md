# Seed dataset — honest status

This is a **verified representative subset**, not the full universe described in the
master spec (§4). The spec explicitly prefers a smaller verified dataset over a larger
unreliable one, and forbids claiming the 250+ catalog exists just because it was listed.

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
validate. The schema and API do not change as the dataset grows toward the 250+ /
150-170 targets. Each addition must be hand-verified (official URL, correct
classification, correct Wikipedia/Wikidata identity where one exists).
