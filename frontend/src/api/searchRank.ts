// Search ranking shared by the static (in-browser) search. The FastAPI backend mirrors
// these tiers in graph_service.search so live and static builds return the same order.
//
// Tiers (lower is better):
//   0 exact name/alias · 1 name prefix · 2 alias prefix · 3 name substring
//   4 alias substring · 5 every query word found in name/aliases ("postgres db")
//   6 typo-tolerant match on a whole name/alias or one of its words ("kubernets")
//   7 description contains the query (3+ chars)

export type MatchedOn = "name" | "alias" | "substring" | "words" | "fuzzy" | "description";

export interface Rankable {
  name: string;
  aliases: string[];
  short_description?: string | null;
}

/** Optimal-string-alignment distance, bailing out once it must exceed `max`. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    rows.push(new Array<number>(b.length + 1).fill(0));
    rows[i][0] = i;
  }
  for (let j = 0; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, rows[i - 2][j - 2] + 1);
      }
      rows[i][j] = v;
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return max + 1;
  }
  return rows[a.length][b.length];
}

/** Typos allowed for a query of this length: none under 4 chars, 1 up to 6, then 2. */
export function typoBudget(len: number): number {
  if (len < 4) return 0;
  return len < 7 ? 1 : 2;
}

const WORD_SPLIT = /[\s/\-_.()&,+]+/;

export function rankMatch(entry: Rankable, rawQuery: string): { rank: number; matched: MatchedOn } | null {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return null;
  const name = entry.name.toLowerCase();
  const aliases = entry.aliases.map((a) => a.toLowerCase());
  if (name === q) return { rank: 0, matched: "name" };
  if (aliases.includes(q)) return { rank: 0, matched: "alias" };
  if (name.startsWith(q)) return { rank: 1, matched: "name" };
  if (aliases.some((a) => a.startsWith(q))) return { rank: 2, matched: "alias" };
  if (name.includes(q)) return { rank: 3, matched: "substring" };
  if (aliases.some((a) => a.includes(q))) return { rank: 4, matched: "alias" };

  const haystack = [name, ...aliases].join(" ");
  const tokens = q.split(WORD_SPLIT).filter(Boolean);
  if (tokens.length > 1 && tokens.every((t) => haystack.includes(t))) {
    return { rank: 5, matched: "words" };
  }

  const budget = typoBudget(q.length);
  if (budget > 0) {
    const candidates = new Set<string>([name, ...aliases]);
    for (const s of [name, ...aliases]) for (const w of s.split(WORD_SPLIT)) if (w.length >= 3) candidates.add(w);
    for (const c of candidates) {
      if (editDistance(q, c, budget) <= budget) return { rank: 6, matched: "fuzzy" };
      // A typo inside a prefix ("kubern" → "kubernetes"): compare against the same-length head.
      if (c.length > q.length && editDistance(q, c.slice(0, q.length), budget) <= budget && q.length >= 5) {
        return { rank: 6, matched: "fuzzy" };
      }
    }
  }

  if (q.length >= 3 && entry.short_description && entry.short_description.toLowerCase().includes(q)) {
    return { rank: 7, matched: "description" };
  }
  return null;
}
