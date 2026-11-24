// One emoji per role, shown next to its title in the Roles panel. Kept in code rather than
// roles.json because it is presentation only; roleEmoji.test.ts fails if a role has none.
const ROLE_EMOJI: Record<string, string> = {
  "frontend-engineer": "🎨",
  "backend-engineer": "⚙️",
  "full-stack-engineer": "🧩",
  "mobile-developer": "📱",
  "devops-engineer": "🚀",
  "data-engineer": "🛢️",
  "ml-engineer": "🤖",
  "ai-engineer": "✨",
  "security-engineer": "🛡️",
  "game-developer": "🎮",
  "embedded-engineer": "🔌",
  "data-scientist": "🔬",
  "data-analyst": "📊",
  "site-reliability-engineer": "🚨",
  "cloud-architect": "☁️",
  "mlops-engineer": "🏭",
  "qa-engineer": "🧪",
  "blockchain-developer": "⛓️",
  "mainframe-developer": "🗄️",
  "enterprise-app-developer": "🏢",
  "audio-software-engineer": "🎧",
  "automotive-aerospace-engineer": "✈️",
  "gis-developer": "🗺️",
  "ecommerce-developer": "🛒",
  "compiler-engineer": "🛠️",
  "penetration-tester": "🕵️",
  "robotics-engineer": "🦾",
  "quantum-software-engineer": "⚛️",
  "product-designer": "✏️",
  "bioinformatician": "🧬",
  "quant-developer": "📈",
  "hardware-design-engineer": "🖥️",
};

export const FALLBACK_ROLE_EMOJI = "🧭";

export function roleEmoji(id: string): string {
  return ROLE_EMOJI[id] ?? FALLBACK_ROLE_EMOJI;
}

export function hasRoleEmoji(id: string): boolean {
  return id in ROLE_EMOJI;
}
