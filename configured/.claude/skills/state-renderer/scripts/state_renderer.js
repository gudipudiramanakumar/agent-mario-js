/**
 * SKILL: state_renderer
 * 
 * Purpose: Convert raw gameAPI.getState() JSON into a clean, agent-readable
 * summary. This is what the configured agent sees instead of raw coordinate
 * dumps. Called automatically before every agent response.
 * 
 * Analogy: This is like a tool that summarizes your codebase structure into
 * a clean architecture doc — instead of reading every file, the agent gets
 * exactly what it needs to act.
 */

/**
 * @param {Object} state - Raw output from window.gameAPI.getState()
 * @returns {string} Human-readable game state summary for the agent
 */
export function renderState(state) {
  if (!state) return "ERROR: Could not read game state.";

  const { mario, entities, score, coins, lives, levelComplete, gameOver } = state;

  if (gameOver) return "GAME OVER. Mario has no lives remaining.";
  if (levelComplete) return "LEVEL COMPLETE! Mario reached the flagpole. 🎉";
  if (mario.isDead) return "Mario is dead. Awaiting respawn...";

  // ── Mario Status ──────────────────────────────────────────────────────────
  const marioStatus = [
    `Mario is at x=${Math.round(mario.x)}, y=${Math.round(mario.y)}`,
    `State: ${mario.state}`,
    mario.isGrounded ? "grounded" : "airborne",
    mario.state === "invincible" ? "⚡ INVINCIBLE (grace period)" : null,
  ].filter(Boolean).join(" | ");

  // ── Nearest Landmark ─────────────────────────────────────────────────────
  const landmark = getNearestLandmark(mario.x);

  // ── Upcoming Threats & Items (within 400px ahead) ─────────────────────────
  const ahead = entities
    .filter(e => e.x > mario.x && e.x < mario.x + 400)
    .sort((a, b) => a.x - b.x);

  const threats = ahead.filter(e => e.type === "goomba" || e.type === "koopa");
  const items = ahead.filter(e => e.type === "mushroom" || e.type === "flower" || e.type === "star");
  const blocks = ahead.filter(e => e.type === "coin_block" || e.type === "brick");

  const threatSummary = threats.length
    ? threats.map(t => `${t.type} at x=${Math.round(t.x)} (${t.alive ? "alive" : "defeated"})`).join(", ")
    : "none";

  const itemSummary = items.length
    ? items.map(i => `${i.type} at x=${Math.round(i.x)} (${i.active ? "SPAWNED - collect now!" : "in block"})`).join(", ")
    : "none";

  const blockSummary = blocks.length
    ? blocks.map(b => `${b.type} at x=${Math.round(b.x)} (${b.hit ? "already hit" : "not yet hit"})`).join(", ")
    : "none";

  // ── Upcoming Gap Warning ──────────────────────────────────────────────────
  const gapWarning = getGapWarning(mario.x);

  // ── Score / HUD ───────────────────────────────────────────────────────────
  const hud = `Score: ${score} | Coins: ${coins} | Lives: ${lives}`;

  // ── Assemble Output ───────────────────────────────────────────────────────
  return [
    "=== GAME STATE ===",
    marioStatus,
    `Nearest landmark: ${landmark}`,
    gapWarning ? `⚠️  GAP AHEAD: ${gapWarning}` : null,
    `Enemies ahead (400px): ${threatSummary}`,
    `Items ahead (400px): ${itemSummary}`,
    `Blocks ahead (400px): ${blockSummary}`,
    hud,
    "==================",
  ].filter(Boolean).join("\n");
}


// ── Internal Helpers ──────────────────────────────────────────────────────────

const LANDMARKS = [
  { name: "Start area",                    x: 0 },
  { name: "First coin question block",     x: 384 },
  { name: "Mushroom question block",       x: 576 },
  { name: "First Goomba zone",             x: 530 },
  { name: "First pipe",                    x: 672 },
  { name: "Second pipe (tall)",            x: 896 },
  { name: "Second Goomba pair",            x: 1050 },
  { name: "Brick staircase / coin blocks", x: 1360 },
  { name: "Third pipe",                    x: 1625 },
  { name: "Large gap ⚠️",                  x: 1800 },
  { name: "Fourth pipe (post-gap)",        x: 1925 },
  { name: "Final stretch",                 x: 2400 },
  { name: "Flagpole",                      x: 3200 },
];

const GAPS = [
  { start: 1750, end: 1850, label: "Large Gap — use run_right then jump_right" },
];

function getNearestLandmark(marioX) {
  // Find the next landmark ahead
  const next = LANDMARKS.find(l => l.x > marioX);
  if (!next) return "Past all landmarks — flagpole ahead";
  const dist = Math.round(next.x - marioX);
  return `${next.name} (~${dist}px ahead at x=${next.x})`;
}

function getGapWarning(marioX) {
  const approaching = GAPS.find(g => marioX < g.end && marioX > g.start - 300);
  if (!approaching) return null;
  const dist = Math.round(approaching.start - marioX);
  if (dist > 0) return `${approaching.label} in ~${dist}px`;
  if (marioX >= approaching.start && marioX <= approaching.end) return "IN THE GAP — jump now!";
  return null;
}
