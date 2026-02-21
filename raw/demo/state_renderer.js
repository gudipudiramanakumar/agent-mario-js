/**
 * state_renderer.js — Browser-ready state renderer skill
 *
 * Sets window.renderState() which gameAPI.getReadableState() calls.
 * Converts raw getState() JSON into a clean, agent-readable summary.
 *
 * Adapted from claude-files-2/state_renderer.js for direct browser use.
 */

(function () {

  const LANDMARKS = [
    { name: 'Start area',                    x: 0 },
    { name: 'First coin question block',     x: 384 },
    { name: 'First Goomba zone',             x: 530 },
    { name: 'Mushroom question block',       x: 576 },
    { name: 'First pipe',                    x: 672 },
    { name: 'Second pipe (tall)',            x: 896 },
    { name: 'Second Goomba pair',            x: 1050 },
    { name: 'Brick staircase / coin blocks', x: 1360 },
    { name: 'Third pipe',                    x: 1625 },
    { name: 'Large gap ⚠',                  x: 1800 },
    { name: 'Fourth pipe (post-gap)',        x: 1925 },
    { name: 'Final stretch',                 x: 2400 },
    { name: 'Flagpole',                      x: 3200 },
  ];

  const GAPS = [
    { start: 1750, end: 1850, label: 'Large Gap — use run_right then jump_right' },
  ];

  function getNearestLandmark(marioX) {
    const next = LANDMARKS.find(l => l.x > marioX);
    if (!next) return 'Past all landmarks — flagpole ahead';
    const dist = Math.round(next.x - marioX);
    return next.name + ' (~' + dist + 'px ahead at x=' + next.x + ')';
  }

  function getGapWarning(marioX) {
    const approaching = GAPS.find(g => marioX < g.end && marioX > g.start - 300);
    if (!approaching) return null;
    const dist = Math.round(approaching.start - marioX);
    if (dist > 0) return approaching.label + ' in ~' + dist + 'px';
    if (marioX >= approaching.start && marioX <= approaching.end) return 'IN THE GAP — jump now!';
    return null;
  }

  window.renderState = function renderState(state) {
    if (!state) return 'ERROR: Could not read game state.';

    const { mario, entities, score, coins, lives, levelComplete, gameOver } = state;

    if (gameOver) return 'GAME OVER. Mario has no lives remaining.';
    if (levelComplete) return 'LEVEL COMPLETE! Mario reached the flagpole.';
    if (mario.isDead) return 'Mario is dead. Awaiting respawn...';

    const marioStatus = [
      'Mario is at x=' + mario.x + ', y=' + mario.y,
      'State: ' + mario.state,
      mario.isGrounded ? 'grounded' : 'airborne',
      mario.state === 'invincible' ? '⚡ INVINCIBLE (grace period)' : null,
    ].filter(Boolean).join(' | ');

    const landmark = getNearestLandmark(mario.x);
    const gapWarning = getGapWarning(mario.x);

    const ahead = entities
      .filter(e => e.x > mario.x && e.x < mario.x + 400)
      .sort((a, b) => a.x - b.x);

    const threats = ahead.filter(e => e.type === 'goomba' || e.type === 'koopa');
    const items   = ahead.filter(e => e.type === 'mushroom' || e.type === 'flower' || e.type === 'star');
    const blocks  = ahead.filter(e => e.type === 'coin_block' || e.type === 'brick');

    const threatSummary = threats.length
      ? threats.map(t => t.type + ' at x=' + t.x + ' (' + (t.alive ? 'alive' : 'defeated') + ')').join(', ')
      : 'none';

    const itemSummary = items.length
      ? items.map(i => i.type + ' at x=' + i.x + ' (' + (i.active ? 'SPAWNED — collect now!' : 'in block') + ')').join(', ')
      : 'none';

    const blockSummary = blocks.length
      ? blocks.map(b => b.type + ' at x=' + b.x + ' (contents: ' + (b.contents || (b.hit ? 'empty' : '?')) + ')').join(', ')
      : 'none';

    const hud = 'Score: ' + score + ' | Coins: ' + coins + ' | Lives: ' + lives;

    return [
      '=== GAME STATE ===',
      marioStatus,
      'Nearest landmark: ' + landmark,
      gapWarning ? '⚠  GAP AHEAD: ' + gapWarning : null,
      'Enemies ahead (400px): ' + threatSummary,
      'Items ahead (400px): ' + itemSummary,
      'Blocks ahead (400px): ' + blockSummary,
      hud,
      '==================',
    ].filter(Boolean).join('\n');
  };

})();
