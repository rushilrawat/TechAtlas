// Presentation-only statistics for a Repo X-Ray scan. Everything is derived from the scan
// itself plus the atlas, so the numbers never claim more than the scanner found.
import type { DetectionStatus, DomainSummary, GraphNode, RepoScan } from "../api/types";

export const CONFIDENCE_ORDER: DetectionStatus[] = ["confirmed", "declared", "inferred", "related"];

export interface FieldStat { id: string; name: string; color: string; count: number; technologies: number; concepts: number; atlasTotal: number }

export interface ScanStats {
  detected: number;
  technologies: number;
  concepts: number;
  confidence: Record<DetectionStatus, number>;
  /** Detections grouped by top-level field, largest first. */
  fields: FieldStat[];
  fieldsTouched: number;
  fieldsTotal: number;
  atlasNodes: number;
  /** Share of the atlas's technologies and concepts this repository touches (0..1). */
  atlasCoverage: number;
  /** Mapped packages over all packages the scanner recognised as dependencies (0..1), or null. */
  mappedShare: number | null;
  ecosystems: { name: string; count: number }[];
  evidenceCount: number;
  evidenceFiles: number;
  direct: number;
  transitive: number;
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

// Package-manifest file names → ecosystem label, for evidence that has no unmapped entry.
const MANIFESTS: [RegExp, string][] = [
  [/(^|\/)package(-lock)?\.json$|(^|\/)(yarn\.lock|pnpm-lock\.yaml)$/, "npm"],
  [/(^|\/)(requirements[^/]*\.txt|pyproject\.toml|setup\.(py|cfg)|Pipfile|poetry\.lock|uv\.lock)$/, "pypi"],
  [/(^|\/)(Cargo\.toml|Cargo\.lock)$/, "cargo"],
  [/(^|\/)(go\.mod|go\.sum)$/, "go"],
  [/(^|\/)(pom\.xml|build\.gradle(\.kts)?)$/, "maven"],
  [/(^|\/)(Gemfile|Gemfile\.lock)$/, "rubygems"],
  [/(^|\/)composer\.json$/, "composer"],
  [/\.csproj$|(^|\/)packages\.config$/, "nuget"],
  [/(^|\/)Package\.swift$|(^|\/)Podfile$/, "swift"],
  [/(^|\/)pubspec\.yaml$/, "pub"],
];

export function computeScanStats(scan: RepoScan, nodesById: Map<string, GraphNode>,
  domainsById: Map<string, DomainSummary>): ScanStats {
  const confidence = { confirmed: 0, declared: 0, inferred: 0, related: 0 } as Record<DetectionStatus, number>;
  const byField = new Map<string, FieldStat>();
  let technologies = 0, concepts = 0, direct = 0, transitive = 0;

  // Atlas size per top-level field (technologies + concepts only).
  const atlasPerField = new Map<string, number>();
  let atlasNodes = 0;
  for (const node of nodesById.values()) {
    if (node.node_type === "domain") continue;
    atlasNodes++;
    const top = topLevel(node.primary_domain, domainsById);
    atlasPerField.set(top, (atlasPerField.get(top) ?? 0) + 1);
  }

  for (const d of scan.detections) {
    confidence[d.detection_status] = (confidence[d.detection_status] ?? 0) + 1;
    if (d.node_type === "concept") concepts++; else technologies++;
    if (d.dependency_classification === "direct") direct++;
    if (d.dependency_classification === "transitive") transitive++;
    const node = nodesById.get(d.node_id);
    const top = node ? topLevel(node.primary_domain, domainsById) : "domain:other";
    const domain = domainsById.get(top);
    const stat = byField.get(top) ?? {
      id: top, name: domain?.name ?? "Other", color: domain?.color ?? "#8a94a6",
      count: 0, technologies: 0, concepts: 0, atlasTotal: atlasPerField.get(top) ?? 0,
    };
    stat.count++;
    if (d.node_type === "concept") stat.concepts++; else stat.technologies++;
    byField.set(top, stat);
  }

  const fieldsTotal = [...domainsById.values()].filter((d) => !d.parent_id).length;
  const fields = [...byField.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  // Ecosystems: unmapped packages carry one, mapped ones are inferred from manifest evidence.
  const eco = new Map<string, number>();
  for (const u of scan.unmapped) eco.set(u.ecosystem, (eco.get(u.ecosystem) ?? 0) + 1);
  const mappedByEco = new Map<string, Set<string>>();
  for (const ev of scan.evidence) {
    const hit = MANIFESTS.find(([re]) => re.test(ev.file_path));
    if (!hit) continue;
    const set = mappedByEco.get(hit[1]) ?? new Set<string>();
    set.add(ev.node_id);
    mappedByEco.set(hit[1], set);
  }
  for (const [name, set] of mappedByEco) eco.set(name, (eco.get(name) ?? 0) + set.size);
  const ecosystems = [...eco.entries()].map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const declaredMapped = scan.detections.filter((d) => d.detection_status === "declared" || d.detection_status === "confirmed").length;
  const mappedDenominator = declaredMapped + scan.unmapped.length;

  return {
    detected: scan.detections.length,
    technologies,
    concepts,
    confidence,
    fields,
    fieldsTouched: fields.filter((f) => f.id !== "domain:other").length,
    fieldsTotal,
    atlasNodes,
    atlasCoverage: atlasNodes ? scan.detections.length / atlasNodes : 0,
    mappedShare: mappedDenominator ? declaredMapped / mappedDenominator : null,
    ecosystems,
    evidenceCount: scan.evidence.length,
    evidenceFiles: new Set(scan.evidence.map((e) => e.file_path)).size,
    direct,
    transitive,
  };
}

export function pct(x: number, digits = 0): string {
  const v = x * 100;
  if (v > 0 && v < 1 && digits === 0) return "<1%";
  return `${v.toFixed(digits)}%`;
}

/** A plain-text / Markdown report the user can paste into an issue, README or chat. */
export function scanSummaryMarkdown(scan: RepoScan, stats: ScanStats, nodesById: Map<string, GraphNode>,
  domainsById: Map<string, DomainSummary>, link?: string): string {
  const r = scan.repository;
  const lines = [
    `## ${r.owner}/${r.name} · TechAtlas Repo X-Ray`,
    "",
    `${stats.technologies} technologies and ${stats.concepts} concepts detected across ${stats.fieldsTouched} of ${stats.fieldsTotal} fields` +
      ` (${pct(stats.atlasCoverage, 1)} of the atlas).`,
    `Confidence: ${CONFIDENCE_ORDER.filter((k) => stats.confidence[k]).map((k) => `${stats.confidence[k]} ${k}`).join(", ") || "none"}.`,
  ];
  if (stats.mappedShare !== null) lines.push(`Dependencies mapped to the atlas: ${pct(stats.mappedShare)} (${scan.unmapped.length} unmapped).`);
  if (stats.fields.length) {
    lines.push("", "### By field");
    for (const f of stats.fields) {
      const members = scan.detections.filter((d) => {
        const n = nodesById.get(d.node_id);
        return (n ? topLevel(n.primary_domain, domainsById) : "domain:other") === f.id;
      });
      lines.push(`- **${f.name}** (${f.count}): ${members.map((d) => nodesById.get(d.node_id)?.label ?? d.node_id).join(", ")}`);
    }
  }
  lines.push("", `Scanned commit ${r.commit_sha.slice(0, 7)} on ${r.default_branch}; ${scan.coverage.files_inspected} files inspected.`);
  if (link) lines.push(`Explore it on the atlas: ${link}`);
  return lines.join("\n");
}
