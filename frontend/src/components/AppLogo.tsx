import { useEffect, useState } from "react";
import type { BrandMark } from "../content/appLogos";

// Brand marks live in their own small chunk (content/appLogos.ts), fetched the first time a
// logo is drawn, so the entry bundle and the content chunk don't grow with them.
let marks: Record<string, BrandMark> | null = null;
let pending: Promise<Record<string, BrandMark>> | null = null;
function loadMarks(): Promise<Record<string, BrandMark>> {
  pending ??= import("../content/appLogos").then((m) => (marks = m.APP_LOGOS));
  return pending;
}

/** Perceived brightness 0..1 of a #rrggbb colour, to pick a readable glyph colour. */
export function luminance(hex: string): number {
  const n = parseInt(hex, 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** One or two letters for apps with no published mark: "Khan Academy" -> "KA", "Slack" -> "S". */
export function monogram(name: string): string {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?")[0]).toUpperCase();
}

const MONO_HUES = [212, 262, 330, 24, 150, 190, 45, 290];
function monoHue(id: string): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return MONO_HUES[h % MONO_HUES.length];
}

/**
 * A company's logo on a tile in its brand colour (Simple Icons, CC0). Apps without a mark
 * get a monogram tile. Decorative: the app's name is always written next to it.
 */
export function AppLogo({ id, name, size = 28 }: { id: string; name: string; size?: number }) {
  const [, setReady] = useState(marks !== null);
  useEffect(() => { if (!marks) void loadMarks().then(() => setReady(true), () => undefined); }, []);
  const mark = marks?.[id];
  const style = { width: size, height: size, borderRadius: Math.round(size * 0.26) };
  if (!marks) return <span className="app-logo is-loading" style={style} aria-hidden />;
  if (!mark) {
    const hue = monoHue(id);
    return (
      <span className="app-logo is-mono" aria-hidden
        style={{ ...style, background: `hsl(${hue} 55% 42%)`, fontSize: Math.round(size * 0.42) }}>{monogram(name)}</span>
    );
  }
  const dark = luminance(mark.hex) > 0.62;
  return (
    <span className="app-logo" aria-hidden style={{ ...style, background: `#${mark.hex}` }}>
      <svg viewBox="0 0 24 24" width={Math.round(size * 0.6)} height={Math.round(size * 0.6)} fill={dark ? "#0b0e14" : "#fff"}>
        <path d={mark.path} />
      </svg>
    </span>
  );
}
