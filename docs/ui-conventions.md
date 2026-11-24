# UI conventions

One page of rules for anything that adds or changes UI. Most problems found in the
2026-11-23 UI audit were inconsistencies between features, so new work should follow
these rules instead of inventing a local variant. If a rule doesn't fit, change it here
first.

## Names

| Thing | Call it | Not |
|---|---|---|
| The home view with every cluster | **the atlas** ("Back to atlas") | Universe, Explore, Universe View |
| A top-level grouping (Backend, Security…) | **field** | domain (code and data still say `domain`) |
| A field nested in another (Generative AI) | **sub-field** | subdomain |
| Nodes inside a field | **members** (same noun in the panel and the hover card) | connections |
| X-Ray statuses | Found in code · Listed as a dependency · Guessed from related files · Related to the stack | Confirmed / Declared / Inferred |

Counts always use thousands separators: `n.toLocaleString("en-US")` (3,122, not 3122).

## Panels

- **Left side** (beside the rail, `left: 72px`, same width and padding): tool panels the
  reader opens from the toolbar. Fields, Stack, Roles, Apps, Guided paths, Learning map,
  Outline.
- **Right side**: what is selected. Node details, Repo X-Ray results.
- **Bottom centre**: a followed path's step card.
- **Modal**: only Keyboard shortcuts and the shared report card. Nothing else dims the atlas.
- **Phones** (≤ 640 px): left-side tool panels become bottom sheets (max 58% height) so
  the map stays visible above them.
- Panels are opaque (`background: var(--panel)`); atlas text must never show through.
- When a panel highlights nodes, the camera frames them inside the space the panel
  leaves (`frameNodes` / `usableRect` in `graph-canvas/framing.ts`). Add new panels to
  `OVERLAY_SELECTORS` there and to the heading `panels` list in `headings.ts`.

## Toolbar

- Labels never change with state. Show "open" with `aria-pressed="true"`, not with a
  different word ("Exit compare", "← Back to Explore").
- 1101 px and up: every tool has a label. 701–1100 px: the five main tools keep labels and
  the utilities move under **More**. Phones: icons only, with `aria-label`.

## Buttons and links

- One primary (filled) button per panel at most: the action most people want next
  (Open report card, Start with Python).
- A whole list row is the button. Don't repeat an "Open" button on every row; use a
  trailing `→` chevron for "opens in place".
- `↗` only for links that leave TechAtlas (GitHub, official sites, Wikipedia).
- "Copy link" is a bordered button like its neighbours, never bare text.
- Lists that switch items have one stepper (← prev · n / N · next →) and one breadcrumb
  at the top ("← All roles"). No extra `<select>`.

## Headings and type

- One visible or visually hidden `<h1>` per view. Panel titles are `<h2>`; sections in a
  panel are `<h3>`, sub-groups `<h4>`.
- Section titles in panels are UPPERCASE small caps (CSS `text-transform`); group titles
  under them are sentence case. Write the text itself in sentence case.
- `font-variant-numeric: tabular-nums` only on elements that hold numbers in columns,
  never on whole panels (Inter's `tnum` widens hyphens: "X - Ray").

## Keyboard and focus

- A group of buttons is one tab stop with arrow keys inside (`data-arrow-nav` +
  `arrowNav` / `arrowNavGrid` from `util/arrowNav.ts`). The field names on the map work
  the same way.
- Opening a panel from the toolbar moves focus to its heading; closing it returns focus
  to the button (`util/usePanelFocus.ts`).
- Esc closes the top-most panel.

## Map labels

- Field names are DOM buttons placed by `placeHeadings`; node names are drawn by
  `drawNodeLabel`, which never lets two labels overlap and skips a label that has no room
  (hover still shows it). Field names avoid node names that were drawn.
- Sub-field names appear from the first zoom step in (camera ratio < 0.85); at the overview
  fit, hovering a sub-field names it.

## Themes

Every new colour needs a light-theme value. Check both themes before merging: the
`e2e/visual-themes.spec.ts` suite screenshots six key states in dark and light.
