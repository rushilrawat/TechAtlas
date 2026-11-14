<div align="center">

# 🗺️ TechAtlas

**An interactive map of software technologies and how they connect.**

*Explore the landscape. Follow a learning path. See where your own stack fits.*

[![CI](https://github.com/rushilrawat/TechAtlas/actions/workflows/ci.yml/badge.svg)](https://github.com/rushilrawat/TechAtlas/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Python 3.11+](https://img.shields.io/badge/python-3.11%2B-3776AB.svg?logo=python&logoColor=white)](backend/)
[![React + Vite](https://img.shields.io/badge/frontend-React%20%2B%20Vite-61DAFB.svg?logo=react&logoColor=black)](frontend/)
[![TypeScript](https://img.shields.io/badge/language-TypeScript-3178C6.svg?logo=typescript&logoColor=white)](frontend/)

**[Explore the atlas](https://rushilrawat.github.io/TechAtlas/)** · **[Run it locally](docs/development-setup.md)**

</div>

---

## 🎯 The idea

TechAtlas brings domains, concepts, and real technologies into one connected graph.
Typed relationships show *why* nodes belong together, while the interactive atlas lets
you move from a broad field to an individual tool without losing the surrounding context.

## ✨ Highlights

- 🧭 **Explore the graph:** a radial atlas with domain sectors, semantic zoom, search,
  keyboard navigation, filters, and light and dark themes.
- 🧩 **Understand connections:** inspect a node's neighbors, compare technologies,
  or follow curated guided paths through the graph.
- 🔗 **Share a view:** domain, technology, and concept pages have crawlable HTML,
  Open Graph cards, JSON-LD, and links back into the atlas.
- 🧪 **Inspect a repository:** Repo X-Ray detects a public GitHub repository's stack
  and highlights it in the atlas. Pre-computed example scans of well-known repositories
  work everywhere; scanning any repository needs the scanner backend.
- 📚 **Grow the graph carefully:** curated seed data is validated before publication.
  Discovery assist can propose additions from Wikidata; richer relationships remain
  subject to human review.

<!-- graph-stats:start (written by scripts/build_dataset.py) -->
## 📊 The graph (dataset v0.7.0)

| | |
|---|---:|
| Total nodes | **1,194** |
| Domains | **29** |
| Technologies | **397** |
| Concepts | **768** |
| Typed relationships | **3,517** |
| Relationship types | **14** |
| Curated guided paths | **145** |
| Isolated nodes | **0** |

The largest relationship groups are **related to (1,174)**, **belongs to domain (1,165)**, **supports (278)**, **implements (206)**. Counts come from the checked-in
[`data/graph.json`](data/graph.json) and [`data/seed/journeys.json`](data/seed/journeys.json)
and are rewritten by `scripts/build_dataset.py` on every `make data`; “isolated” means
a node with no incident edge.
<!-- graph-stats:end -->

## 🏗️ How it fits together

```text
Curated seed data ──► build + validation ──► graph and layout JSON
                                            │
                               ┌────────────┴────────────┐
                               ▼                         ▼
                         FastAPI graph API       Static API snapshot
                               │                         │
                               └────────────┬────────────┘
                                            ▼
                              React + TypeScript + Sigma.js
                                            │
                                       Explore atlas
```

The GitHub Pages build uses the static API snapshot. The FastAPI service adds live
summaries and Repo X-Ray scanning. See the [architecture notes](docs/architecture.md)
and [scanner deployment guide](docs/deployment-scanner.md) for details.

## 🚀 Quick start

Requires **Python 3.11+** and **Node.js 20+**. GNU Make is optional but convenient.

```bash
make setup
make dev
```

Open **http://localhost:5173**. The frontend runs on port 5173 and the backend on
port 8000. For manual setup, port overrides, and static mode, see the
[development guide](docs/development-setup.md).

## ✅ Checks

```bash
make data     # rebuild and validate the graph
make test     # backend and frontend tests
make lint     # Ruff, TypeScript, and ESLint
make build    # production frontend bundle
```

CI also checks the backend Docker health endpoint. The Pages deployment runs a browser
smoke test before publishing. See [known issues](docs/known-issues.md) and
[performance notes](docs/performance.md) for current limitations and measurements.

## 📁 Repository map

| Path | Purpose |
|---|---|
| [`data/`](data/) | Graph schema, curated seeds, and generated graph data |
| [`scripts/`](scripts/) | Dataset validation, layout, discovery, and popularity tools |
| [`backend/`](backend/) | FastAPI graph service and repository scanner |
| [`frontend/`](frontend/) | React, TypeScript, and Sigma.js atlas |
| [`docs/`](docs/) | Architecture, setup, deployment, and methodology notes |

## 🔭 Next

AI project-to-stack recommendations are specified but not yet implemented. Repo X-Ray
on the public site also depends on configuring the scanner backend; see the
[deployment guide](docs/deployment-scanner.md).

## 📄 License

TechAtlas is licensed under the [MIT License](LICENSE). The bundled font retains its
own [SIL Open Font License](frontend/public/fonts/OFL.txt).
