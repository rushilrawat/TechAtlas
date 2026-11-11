# Atlas-first redesign

## Intent

Make the technology map the first thing a visitor understands and can use. Keep
the canonical 607-node, 1116-edge graph, its radial families, search, filtering,
relationship details, and Repo X-Ray intact. The redesign changes the interface
around the graph and its visual hierarchy, not the truth of the data.

## Chosen direction and alternatives

- **Atlas first (chosen):** a large uninterrupted graph, compact navigation,
  contextual controls, and details that appear only when needed. This best serves
  visitors exploring how technologies relate.
- **Search first:** a prominent search/results page feeding the map. Easier for a
  visitor with a specific technology in mind, but weakens the atlas as the entry.
- **Repo X-Ray first:** lead with repository analysis. Useful for returning scanner
  users, but the static public build cannot run scans.

## Desktop screen

1. A slim header contains the brand, a single search field, Explore and Repo
   X-Ray navigation, and a compact graph count.
2. The graph fills the remaining viewport. Domain names are legible at overview;
   14–28 genuine curves form a noncrossing backbone. The center brand text and
   decorative rings are removed. The map never becomes a row of domain markers.
3. A compact left rail stacks domain browsing and filters. The rail leaves the
   radial atlas visually dominant.
4. A bottom corner control explains edge colors and zoom/keyboard actions.
5. Selecting a node or edge opens one contextual detail panel at the right.
   A node's relationship list is complete, but only one chosen or focused
   connection is drawn at a time. Opening a neighbor is a separate action.
   The camera frames selected content outside the panel.

## Tablet and mobile

- Search remains reachable in the header. Domain browsing and filters become
  separate sheets; neither covers the graph at rest.
- Node and relationship details use a bottom sheet with a visible close action.
- The graph remains zoomable and pannable; expanded hit areas, search, domain
  browsing, and keyboard controls provide paths to dense nodes.

## Interaction and states

- Overview, node focus, relationship focus, active filters, empty filter result,
  loading, and API error have distinct visual treatments.
- Repo X-Ray is restyled with the same controls and surfaces while retaining its
  entry, Back to Explore, Stack/Universe switching, scan results, and evidence.
  Its graph lines follow the same sparse or single-preview rule.
- Respect reduced motion. Visible focus, meaningful labels, Escape behavior, and
  minimum-size controls remain part of the design.

## Acceptance

- All 607 canonical nodes and 1116 relationships remain addressable; no synthetic
  edges or aggregate replacements are introduced.
- Overview curves have no crossings or merged runs away from shared endpoints
  in the measured desktop, tablet, and mobile views.
- The 1440×900 overview does not regress beyond the current 26 node overlaps,
  7 label collisions, and 0 panel occlusions. Review at 1920×1080, 768×1024,
  and 390×844 as well.
- Search, domain navigation, filters, edge details, Repo X-Ray, and Back to
  Explore pass their existing browser regressions. Production static mode still
  works without FastAPI and contains no test hooks.

## Implementation boundaries

Build within the existing React, TypeScript, Sigma, and CSS stack. Reuse the
canonical graph API and current layout generator. Avoid replacing the graph
engine or changing the dataset as part of this interface redesign.
