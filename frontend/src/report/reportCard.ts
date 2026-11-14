// Shareable repo "report card": one screen that sums up a scan ("next.js uses 16
// technologies across 6 fields") with a link, a README badge and an OG image.
//
// Pre-computed example scans get a real page at /report/<slug> (built at deploy time by
// scripts/build_report_cards.py, with a PNG social card and an SVG badge). Any other scan
// shares as ?card=<owner/name>~<slug.slug...>, which renders from the atlas alone, so
// the link works on the static site with no backend.
import type { DomainSummary, GraphNode } from "../api/types";

export interface ReportField { id: string; name: string; color: string; nodes: GraphNode[] }
export interface Report {
  repo: string;
  technologies: number;
  concepts: number;
  fields: ReportField[];
  nodeIds: string[];
}

function topLevel(domainId: string, domainsById: Map<string, DomainSummary>): string {
  let id = domainId;
  for (let i = 0; i < 4; i++) {
    const parent = domainsById.get(id)?.parent_id;
    if (!parent) break;
    id = parent;
  }
  return id;
}

export function buildReport(repo: string, nodeIds: string[], nodesById: Map<string, GraphNode>,
  domainsById: Map<string, DomainSummary>): Report {
  const nodes = [...new Set(nodeIds)].map((id) => nodesById.get(id)).filter((n): n is GraphNode => !!n && n.node_type !== "domain");
  const byField = new Map<string, ReportField>();
  for (const n of nodes) {
    const top = topLevel(n.primary_domain, domainsById);
    const d = domainsById.get(top);
    const f = byField.get(top) ?? { id: top, name: d?.name ?? "Other", color: d?.color ?? "#8a94a6", nodes: [] };
    f.nodes.push(n);
    byField.set(top, f);
  }
  const rank = (n: GraphNode) => (n.node_type === "technology" ? 0 : 1);
  for (const f of byField.values()) f.nodes.sort((a, b) => rank(a) - rank(b) || (b.size ?? 0) - (a.size ?? 0) || a.label.localeCompare(b.label));
  const fields = [...byField.values()].sort((a, b) => b.nodes.length - a.nodes.length || a.name.localeCompare(b.name));
  return {
    repo,
    technologies: nodes.filter((n) => n.node_type === "technology").length,
    concepts: nodes.filter((n) => n.node_type === "concept").length,
    fields,
    nodeIds: nodes.map((n) => n.id),
  };
}

export function headline(r: Report): string {
  const name = r.repo.split("/")[1] ?? r.repo;
  const t = `${r.technologies} ${r.technologies === 1 ? "technology" : "technologies"}`;
  const f = `${r.fields.length} ${r.fields.length === 1 ? "field" : "fields"}`;
  return `${name} uses ${t} across ${f}`;
}

const REPO = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const SLUG = /^[a-z0-9-]+$/;

/** ?card=<owner/name>~<slug.slug...> */
export function encodeCard(repo: string, slugs: string[]): string {
  return `${repo}~${slugs.filter((s) => SLUG.test(s)).join(".")}`;
}
export function decodeCard(value: string | null): { repo: string; slugs: string[] } | null {
  if (!value) return null;
  const i = value.indexOf("~");
  if (i < 0) return null;
  const repo = value.slice(0, i);
  const slugs = value.slice(i + 1).split(".").filter((s) => SLUG.test(s)).slice(0, 200);
  return REPO.test(repo) && slugs.length ? { repo, slugs } : null;
}
export function readCardParam(search: string) {
  return decodeCard(new URLSearchParams(search).get("card"));
}
export function writeCardParam(search: string, value: string | null): string {
  const p = new URLSearchParams(search);
  p.delete("card");
  if (value) p.set("card", value);
  return p.toString();
}

function siteRoot(): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}`.replace(/\/?$/, "/");
}

/** The public link for a report: the pre-built page for examples, the ?card= link otherwise. */
export function reportLink(r: Report, slugsById: Map<string, string>, example?: string | null): string {
  if (example) return `${siteRoot()}report/${example}/`;
  const slugs = r.nodeIds.map((id) => slugsById.get(id)).filter((s): s is string => !!s);
  return `${siteRoot()}?${writeCardParam("", encodeCard(r.repo, slugs))}`;
}

/** README badge. Examples use the pre-built SVG; other repos a static shields.io badge. */
export function badgeMarkdown(r: Report, link: string, example?: string | null): string {
  const img = example
    ? `${siteRoot()}report/${example}/badge.svg`
    : `https://img.shields.io/badge/TechAtlas-${r.technologies}%20technologies-7aa2f7`;
  return `[![Mapped by TechAtlas](${img})](${link})`;
}

/** Link to the stack recommender, seeded with this repo's technologies. */
export function recommendLink(r: Report, slugsById: Map<string, string>): string {
  const p = new URLSearchParams();
  p.set("stack", "1");
  const slugs = r.nodeIds.map((id) => slugsById.get(id)).filter((s): s is string => !!s).slice(0, 80);
  p.set("sn", slugs.join(","));
  p.set("sr", r.repo);
  return `${siteRoot()}?${p.toString()}`;
}
