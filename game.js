(function () {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const targetEl = document.getElementById("target");
  const message = document.getElementById("message");
  const messageTitle = document.getElementById("messageTitle");
  const messageText = document.getElementById("messageText");
  const primaryAction = document.getElementById("primaryAction");
  const modeSelector = document.getElementById("modeSelector");
  const basicMode = document.getElementById("basicMode");
  const advancedMode = document.getElementById("advancedMode");
  const pauseButton = document.getElementById("pauseButton");
  const pauseIcon = document.getElementById("pauseIcon");
  const mergeTool = document.getElementById("mergeTool");
  const clearTool = document.getElementById("clearTool");
  const mergeCountEl = document.getElementById("mergeCount");
  const clearCountEl = document.getElementById("clearCount");

  const storageKey = "bubble-2048-state-v1";
  const targetValue = 2048;
  const baseValues = [2, 4, 8];
  const palette = {
    2: ["#9ee7ff", "#39b9f2"],
    4: ["#a7f6c4", "#35c46a"],
    8: ["#ffe98f", "#ffc857"],
    16: ["#ffbd8b", "#ff8a45"],
    32: ["#ff9db1", "#ef5b68"],
    64: ["#d9a8ff", "#9658e5"],
    128: ["#92a8ff", "#4b72f0"],
    256: ["#78e3dd", "#18b7a8"],
    512: ["#ffd27d", "#f59f23"],
    1024: ["#ff91d0", "#d9419c"],
    2048: ["#ffffff", "#35c46a"],
    4096: ["#ffffff", "#17314f"],
  };

  const state = {
    width: 0,
    height: 0,
    dpr: 1,
    running: false,
    paused: false,
    ended: false,
    won: false,
    mode: "basic",
    score: 0,
    best: 0,
    shots: 0,
    lastNudgeShot: 0,
    bubbles: [],
    particles: [],
    popups: [],
    projectile: null,
    nextValue: 2,
    aim: null,
    combo: {
      count: 0,
      lastAt: 0,
      showUntil: 0,
    },
    goal: {
      value: 4,
      expression: "2+2",
      need: 3,
      progress: 0,
      flash: 0,
      solved: 0,
    },
    manual: {
      active: false,
      bubbleId: null,
      targetId: null,
      offsetX: 0,
      offsetY: 0,
      moved: false,
    },
    inflate: {
      active: false,
      value: 0,
      release: 0,
      startX: 0,
      lastX: 0,
      startedAt: 0,
    },
    launcherX: 0,
    dangerY: 0,
    radius: 24,
    mergeTools: 1,
    clearTools: 1,
    shake: 0,
    lastTime: 0,
  };

  let nextId = 1;

  function loadSave() {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      state.best = Number(parsed.best) || 0;
      if (parsed.mode === "basic" || parsed.mode === "advanced") {
        state.mode = parsed.mode;
      }
    } catch (error) {
      state.best = 0;
    }
  }

  function saveBest() {
    localStorage.setItem(storageKey, JSON.stringify({ best: state.best, mode: state.mode }));
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    state.dpr = Math.min(window.devicePixelRatio || 1, 2);
    state.width = Math.max(300, Math.floor(rect.width));
    state.height = Math.max(420, Math.floor(rect.height));
    canvas.width = Math.floor(state.width * state.dpr);
    canvas.height = Math.floor(state.height * state.dpr);
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    state.radius = clamp(Math.min(state.width, state.height) * 0.056, 20, 32);
    state.launcherX = state.width / 2;
    state.dangerY = state.height - state.radius * 3.2;
    keepBubblesInBounds();
  }

  function startGame() {
    state.running = true;
    state.paused = false;
    state.ended = false;
    state.won = false;
    state.score = 0;
    state.shots = 0;
    state.lastNudgeShot = 0;
    state.bubbles = [];
    state.particles = [];
    state.popups = [];
    state.projectile = null;
    state.nextValue = 2;
    state.combo.count = 0;
    state.combo.lastAt = 0;
    state.combo.showUntil = 0;
    state.goal.value = 4;
    state.goal.expression = "2+2";
    state.goal.need = 3;
    state.goal.progress = 0;
    state.goal.flash = 0;
    state.goal.solved = 0;
    state.manual.active = false;
    state.manual.bubbleId = null;
    state.manual.targetId = null;
    state.manual.moved = false;
    state.inflate.active = false;
    state.inflate.value = 0;
    state.inflate.release = 0;
    state.inflate.startX = state.width / 2;
    state.inflate.lastX = state.width / 2;
    state.inflate.startedAt = 0;
    state.mergeTools = 1;
    state.clearTools = 1;
    state.shake = 0;
    nextId = 1;
    seedBoard();
    if (state.mode === "advanced") {
      setNextMathGoal(true);
    } else {
      setNextBasicGoal(true);
    }
    hideMessage();
    updateHud();
  }

  function seedBoard() {
    const rows = 3;
    const cols = Math.max(5, Math.floor(state.width / (state.radius * 2.55)));
    const gap = state.radius * 2.38;
    const startX = (state.width - (cols - 1) * gap) / 2;
    const startY = state.radius * 1.8;

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        if (Math.random() < 0.22 && row > 0) continue;
        const x = startX + col * gap + (row % 2 ? state.radius * 0.65 : 0);
        const y = startY + row * gap * 0.9;
        addBubble(x, y, randomSeedValue());
      }
    }
  }

  function randomSeedValue() {
    const roll = Math.random();
    if (roll > 0.86) return 16;
    if (roll > 0.62) return 8;
    if (roll > 0.34) return 4;
    return 2;
  }

  function addBubble(x, y, value, extra) {
    const bubble = Object.assign(
      {
        id: nextId,
        x,
        y,
        r: radiusForValue(value),
        value,
        vx: 0,
        vy: 0,
        pulse: 0,
        born: performance.now(),
      },
      extra || {}
    );
    nextId += 1;
    state.bubbles.push(bubble);
    return bubble;
  }

  function nextLaunchValue() {
    const highest = highestBubble();
    const pool = highest >= 512 ? [2, 4, 8, 16] : highest >= 128 ? [2, 4, 8] : baseValues;
    const roll = Math.random();
    if (roll > 0.82) return pool[Math.min(pool.length - 1, 2)];
    if (roll > 0.42) return pool[1] || 2;
    return pool[0];
  }

  function launch(pointer, charge) {
    if (!state.running || state.paused || state.projectile) return;

    const startX = clamp(state.launcherX, state.radius + 8, state.width - state.radius - 8);
    const startY = state.height - state.radius * 1.35;
    const inflation = clamp(charge || 0, 0, 1);
    const value = chargedValue(state.nextValue, inflation);
    const dragDrift = clamp((pointer.x - state.inflate.startX) * 0.5, -80, 80);
    const softDrift = (Math.random() - 0.5) * 22;
    state.projectile = {
      id: nextId,
      x: startX,
      y: startY,
      r: radiusForValue(value) * (1 + inflation * 0.08),
      value,
      vx: dragDrift + softDrift,
      vy: -clamp(state.height * (0.31 + inflation * 0.12), 240, 360),
      pulse: 0.18 + inflation * 0.26,
      inflate: inflation,
      age: 0,
      driftSeed: Math.random() * Math.PI * 2,
    };
    nextId += 1;
    state.nextValue = nextLaunchValue();
    state.aim = null;
    state.shots += 1;
    updateHud();
  }

  function update(dt) {
    if (!state.running || state.paused || state.ended) return;
    updateInflation(dt);
    updateProjectile(dt);
    updateBubbles(dt);
    updateParticles(dt);
    updatePopups(dt);
    state.goal.flash = Math.max(0, state.goal.flash - dt);
    state.shake = Math.max(0, state.shake - dt * 16);

    if (state.shots > 0 && state.shots % 5 === 0 && state.lastNudgeShot !== state.shots && !state.projectile) {
      state.lastNudgeShot = state.shots;
      nudgeBoardDown();
    }

    if (highestBubble() >= targetValue) {
      winGame();
    } else if (state.bubbles.some((bubble) => bubble.y + bubble.r > state.dangerY)) {
      endGame(false);
    }
  }

  function updateProjectile(dt) {
    const p = state.projectile;
    if (!p) return;
    p.age += dt;
    p.inflate = Math.max(0, (p.inflate || 0) - dt * 0.65);
    p.pulse = Math.max(0, p.pulse - dt);
    const target = findFloatTarget(p);
    const floatTarget = -clamp(state.height * (0.28 + (p.inflate || 0) * 0.08), 220, 330);
    const windTarget = Math.sin(p.age * 1.45 + p.driftSeed) * 24 + Math.sin(p.age * 3.1 + p.driftSeed) * 6;
    p.vy += (floatTarget - p.vy) * dt * 1.45;
    p.vx += (windTarget - p.vx) * dt * 0.65;
    if (target) {
      p.vx += clamp((target.x - p.x) * 0.9, -110, 110) * dt;
      p.vy += clamp((target.y - p.y) * 0.08, -26, 12) * dt;
    }
    p.r += (radiusForValue(p.value) - p.r) * dt * 1.4;
    p.x += p.vx * dt;
    p.y += (p.vy + Math.sin(p.age * 5 + p.driftSeed) * 12) * dt;

    if (p.x - p.r < 6) {
      p.x = p.r + 6;
      p.vx = Math.abs(p.vx);
    }

    if (p.x + p.r > state.width - 6) {
      p.x = state.width - p.r - 6;
      p.vx = -Math.abs(p.vx);
    }

    if (p.y - p.r < 8) {
      settleProjectile(p.x, p.r + 8);
      return;
    }

    for (const bubble of state.bubbles) {
      const distance = Math.hypot(p.x - bubble.x, p.y - bubble.y);
      if (p.value === bubble.value && distance <= p.r + bubble.r + state.radius * 0.42) {
        mergeInto(bubble, p.value);
        state.projectile = null;
        return;
      }

      if (distance <= p.r + bubble.r - 2) {
        const angle = Math.atan2(p.y - bubble.y, p.x - bubble.x);
        const x = bubble.x + Math.cos(angle) * (bubble.r + p.r + 1);
        const y = bubble.y + Math.sin(angle) * (bubble.r + p.r + 1);
        settleProjectile(x, y);
        return;
      }
    }
  }

  function settleProjectile(x, y) {
    const p = state.projectile;
    if (!p) return;
    const bubble = addBubble(
      clamp(x, p.r + 8, state.width - p.r - 8),
      clamp(y, p.r + 8, state.height - p.r * 2.2),
      p.value,
      { pulse: 0.28 }
    );
    state.projectile = null;
    resolveOverlaps();
    mergeNearby(bubble);
  }

  function mergeInto(target, incomingValue) {
    target.value = incomingValue * 2;
    target.r = radiusForValue(target.value);
    target.pulse = 0.55;
    target.vx *= 0.2;
    target.vy *= 0.2;
    burst(target.x, target.y, target.value);
    registerMerge(target.x, target.y, target.value);
    state.shake = 0.5;
    mergeNearby(target);
    updateHud();
  }

  function manualMerge(source, target) {
    const nextValue = source.value * 2;
    target.x = (target.x + source.x) / 2;
    target.y = (target.y + source.y) / 2;
    removeBubble(source);
    target.value = nextValue;
    target.r = radiusForValue(nextValue);
    target.vx = 0;
    target.vy = 0;
    target.pulse = 0.8;
    burst(target.x, target.y, nextValue);
    registerMerge(target.x, target.y, nextValue);
    state.shake = 0.22;
    mergeNearby(target);
    updateHud();
  }

  function registerMerge(x, y, value) {
    const now = performance.now();
    if (now - state.combo.lastAt < 2400) {
      state.combo.count += 1;
    } else {
      state.combo.count = 1;
    }
    state.combo.lastAt = now;
    state.combo.showUntil = now + 1300;

    const comboBonus = state.combo.count > 1 ? Math.floor(value * Math.min(1.5, state.combo.count * 0.18)) : 0;
    state.score += value + comboBonus;
    state.best = Math.max(state.best, state.score);
    saveBest();

    addPopup(x, y - radiusForValue(value) * 0.9, comboBonus ? `+${value} 连击+${comboBonus}` : `+${value}`, comboBonus ? "#ffc857" : "#ffffff");
    updateGoal(value, x, y);
  }

  function updateGoal(value, x, y) {
    if (state.mode === "advanced") {
      updateMathGoal(value, x, y);
    } else {
      updateBasicGoal(value, x, y);
    }
  }

  function updateBasicGoal(value, x, y) {
    if (value < state.goal.value) return;
    state.goal.progress += 1;
    state.goal.flash = 0.65;
    addGoalSpark(x, y);
    addPopup(x, y - state.radius * 2.8, "完成目标", "#35c46a");

    if (state.goal.progress >= state.goal.need) {
      rewardGoal(x, y);
      setNextBasicGoal(false);
    }
  }

  function updateMathGoal(value, x, y) {
    if (value !== state.goal.value) return;
    state.goal.progress += 1;
    state.goal.solved += 1;
    state.goal.flash = 0.65;
    addGoalSpark(x, y);
    addPopup(x, y - state.radius * 2.8, "答对啦", "#35c46a");

    if (state.goal.progress >= state.goal.need) {
      rewardGoal(x, y);
      state.goal.progress = 0;
    }
    setNextMathGoal(false);
    state.goal.flash = 1.1;
  }

  function rewardGoal(x, y) {
    const rewardMerge = state.mergeTools <= state.clearTools;
    if (rewardMerge) {
      state.mergeTools += 1;
      addPopup(x, y - state.radius * 2.2, "奖励 整理+1", "#35c46a");
    } else {
      state.clearTools += 1;
      addPopup(x, y - state.radius * 2.2, "奖励 清理+1", "#ef5b68");
    }
  }

  function setNextBasicGoal(initial) {
    state.goal.value = pickBasicGoalValue(initial);
    state.goal.expression = "";
    state.goal.need = state.goal.value >= 128 ? 3 : 2;
    state.goal.progress = 0;
    state.goal.flash = initial ? 0 : 1.1;
  }

  function pickBasicGoalValue(initial) {
    if (initial) return Math.random() > 0.45 ? 16 : 8;
    const highest = Math.max(16, highestBubble());
    const current = state.goal.value;
    if (current < 64) return current * 2;
    if (highest >= current * 2 && Math.random() > 0.35) return Math.min(targetValue, current * 2);
    return Math.min(targetValue, current);
  }

  function setNextMathGoal(initial) {
    const value = pickGoalValue(initial);
    state.goal.value = value;
    state.goal.expression = makeMathExpression(value);
    state.goal.need = 3;
    if (initial) {
      state.goal.progress = 0;
      state.goal.solved = 0;
    }
  }

  function pickGoalValue(initial) {
    if (initial) return Math.random() > 0.45 ? 8 : 4;
    const highest = Math.max(16, highestBubble());
    const smallValues = [4, 8, 16];
    const biggerValues = [];
    for (let value = 32; value <= Math.min(highest, 256); value *= 2) {
      biggerValues.push(value);
    }
    if (biggerValues.length > 0 && Math.random() < 0.35) {
      return biggerValues[Math.floor(Math.random() * biggerValues.length)];
    }
    return smallValues[Math.floor(Math.random() * smallValues.length)];
  }

  function makeMathExpression(answer) {
    if (answer <= 20) {
      return Math.random() < 0.5 ? makeAdditionWithin20(answer) : makeSubtractionWithin20(answer);
    }
    const half = answer / 2;
    if (Number.isInteger(half)) return `${half}+${half}`;
    return `${answer}-0`;
  }

  function makeAdditionWithin20(answer) {
    const min = answer > 1 ? 1 : 0;
    const max = Math.max(min, Math.min(answer - 1, 19));
    const a = randomInt(min, max);
    const b = answer - a;
    return `${a}+${b}`;
  }

  function makeSubtractionWithin20(answer) {
    const a = randomInt(answer, 20);
    const b = a - answer;
    return `${a}-${b}`;
  }

  function mergeNearby(origin) {
    let changed = true;
    while (changed && origin) {
      changed = false;
      const match = state.bubbles.find((bubble) => {
        if (bubble.id === origin.id || bubble.value !== origin.value) return false;
        return Math.hypot(bubble.x - origin.x, bubble.y - origin.y) < origin.r * 2.55;
      });

      if (match) {
        origin.x = (origin.x + match.x) / 2;
        origin.y = (origin.y + match.y) / 2;
        removeBubble(match);
        origin.value *= 2;
        origin.r = radiusForValue(origin.value);
        origin.pulse = 0.6;
        burst(origin.x, origin.y, origin.value);
        registerMerge(origin.x, origin.y, origin.value);
        changed = true;
      }
    }
    resolveOverlaps();
    updateHud();
  }

  function removeBubble(target) {
    state.bubbles = state.bubbles.filter((bubble) => bubble.id !== target.id);
  }

  function updateBubbles(dt) {
    for (const bubble of state.bubbles) {
      bubble.pulse = Math.max(0, bubble.pulse - dt);
      if (state.manual.active && bubble.id === state.manual.bubbleId) {
        bubble.vx = 0;
        bubble.vy = 0;
        continue;
      }
      bubble.x += bubble.vx * dt;
      bubble.y += bubble.vy * dt;
      bubble.vx *= 0.94;
      bubble.vy *= 0.94;

      if (bubble.x - bubble.r < 8) {
        bubble.x = bubble.r + 8;
        bubble.vx = Math.abs(bubble.vx) * 0.34;
      }
      if (bubble.x + bubble.r > state.width - 8) {
        bubble.x = state.width - bubble.r - 8;
        bubble.vx = -Math.abs(bubble.vx) * 0.34;
      }
      if (bubble.y - bubble.r < 8) {
        bubble.y = bubble.r + 8;
        bubble.vy = Math.abs(bubble.vy) * 0.2;
      }
    }

    resolveOverlaps();
  }

  function updateInflation(dt) {
    if (state.inflate.active && !state.projectile) {
      syncInflation();
      state.inflate.release = state.inflate.value;
      return;
    }
    state.inflate.release = Math.max(0, state.inflate.release - dt * 2.7);
  }

  function syncInflation() {
    if (!state.inflate.startedAt) return;
    const heldSeconds = (performance.now() - state.inflate.startedAt) / 1000;
    state.inflate.value = clamp(0.08 + heldSeconds * 0.72, 0.08, 1);
  }

  function findFloatTarget(projectile) {
    let best = null;
    let bestScore = Infinity;
    for (const bubble of state.bubbles) {
      if (bubble.value !== projectile.value || bubble.y > projectile.y - projectile.r * 0.4) continue;
      const dx = Math.abs(bubble.x - projectile.x);
      const dy = Math.abs(bubble.y - projectile.y);
      if (dx > state.radius * 4.2 || dy > state.height * 0.72) continue;
      const score = dx * 1.7 + dy * 0.18;
      if (score < bestScore) {
        bestScore = score;
        best = bubble;
      }
    }
    return best;
  }

  function resolveOverlaps() {
    for (let pass = 0; pass < 3; pass += 1) {
      for (let i = 0; i < state.bubbles.length; i += 1) {
        for (let j = i + 1; j < state.bubbles.length; j += 1) {
          const a = state.bubbles[i];
          const b = state.bubbles[j];
          if (state.manual.active && (a.id === state.manual.bubbleId || b.id === state.manual.bubbleId)) {
            continue;
          }
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const distance = Math.hypot(dx, dy) || 1;
          const minDistance = a.r + b.r + 2;
          if (distance < minDistance) {
            const push = (minDistance - distance) * 0.5;
            const nx = dx / distance;
            const ny = dy / distance;
            a.x -= nx * push;
            a.y -= ny * push;
            b.x += nx * push;
            b.y += ny * push;
            a.vx -= nx * 5;
            b.vx += nx * 5;
          }
        }
      }
    }
    keepBubblesInBounds();
  }

  function keepBubblesInBounds() {
    for (const bubble of state.bubbles) {
      bubble.r = radiusForValue(bubble.value);
      bubble.x = clamp(bubble.x, bubble.r + 8, state.width - bubble.r - 8);
      bubble.y = clamp(bubble.y, bubble.r + 8, state.height - bubble.r * 1.6);
    }
  }

  function updateParticles(dt) {
    state.particles = state.particles.filter((particle) => {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 90 * dt;
      return particle.life > 0;
    });
  }

  function updatePopups(dt) {
    state.popups = state.popups.filter((popup) => {
      popup.life -= dt;
      popup.y += popup.vy * dt;
      popup.vy *= 0.98;
      return popup.life > 0;
    });
  }

  function burst(x, y, value) {
    const colors = colorFor(value);
    for (let i = 0; i < 16; i += 1) {
      const angle = (Math.PI * 2 * i) / 16 + Math.random() * 0.16;
      const speed = 70 + Math.random() * 110;
      state.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: 3 + Math.random() * 4,
        color: i % 2 ? colors[0] : colors[1],
        life: 0.42 + Math.random() * 0.24,
      });
    }
  }

  function addGoalSpark(x, y) {
    for (let i = 0; i < 10; i += 1) {
      const angle = (Math.PI * 2 * i) / 10;
      const speed = 35 + Math.random() * 55;
      state.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 18,
        r: 2.5 + Math.random() * 3,
        color: i % 2 ? "#ffc857" : "#ffffff",
        life: 0.62 + Math.random() * 0.22,
      });
    }
  }

  function addPopup(x, y, text, color) {
    state.popups.push({
      x,
      y,
      text,
      color,
      life: 1.05,
      maxLife: 1.05,
      vy: -32,
    });
  }

  function nudgeBoardDown() {
    for (const bubble of state.bubbles) {
      bubble.y += state.radius * 0.42;
      bubble.pulse = Math.max(bubble.pulse, 0.18);
    }
  }

  function useMergeTool() {
    if (!state.running || state.paused || state.mergeTools <= 0) return;
    const pair = findClosestPair();
    if (!pair) return;
    state.mergeTools -= 1;
    const [a, b] = pair;
    a.x = (a.x + b.x) / 2;
    a.y = (a.y + b.y) / 2;
    removeBubble(b);
    a.value *= 2;
    a.r = radiusForValue(a.value);
    a.pulse = 0.8;
    burst(a.x, a.y, a.value);
    registerMerge(a.x, a.y, a.value);
    mergeNearby(a);
    updateHud();
  }

  function findClosestPair() {
    let bestPair = null;
    let bestDistance = Infinity;
    for (let i = 0; i < state.bubbles.length; i += 1) {
      for (let j = i + 1; j < state.bubbles.length; j += 1) {
        const a = state.bubbles[i];
        const b = state.bubbles[j];
        if (a.value !== b.value) continue;
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestPair = [a, b];
        }
      }
    }
    return bestPair;
  }

  function findManualTarget(source) {
    let best = null;
    let bestDistance = Infinity;
    for (const bubble of state.bubbles) {
      if (bubble.id === source.id || bubble.value !== source.value) continue;
      const distance = Math.hypot(bubble.x - source.x, bubble.y - source.y);
      const limit = source.r + bubble.r + state.radius * 1.65;
      if (distance < limit && distance < bestDistance) {
        bestDistance = distance;
        best = bubble;
      }
    }
    return best;
  }

  function getManualBubble() {
    if (!state.manual.bubbleId) return null;
    return state.bubbles.find((bubble) => bubble.id === state.manual.bubbleId) || null;
  }

  function getManualTarget() {
    if (!state.manual.targetId) return null;
    return state.bubbles.find((bubble) => bubble.id === state.manual.targetId) || null;
  }

  function useClearTool() {
    if (!state.running || state.paused || state.clearTools <= 0 || state.bubbles.length === 0) return;
    state.clearTools -= 1;
    const smallest = Math.min(...state.bubbles.map((bubble) => bubble.value));
    const removed = state.bubbles.filter((bubble) => bubble.value === smallest).slice(0, 5);
    for (const bubble of removed) {
      burst(bubble.x, bubble.y, bubble.value);
      state.score += bubble.value;
      removeBubble(bubble);
    }
    state.best = Math.max(state.best, state.score);
    saveBest();
    if (removed.length > 0) {
      addPopup(state.width / 2, state.dangerY - state.radius * 1.4, `清理 +${removed.reduce((total, bubble) => total + bubble.value, 0)}`, "#ef5b68");
    }
    resolveOverlaps();
    updateHud();
  }

  function togglePause() {
    if (!state.running || state.ended) return;
    state.paused = !state.paused;
    pauseIcon.textContent = state.paused ? ">" : "II";
    if (state.paused) {
      showMessage("暂停中", "休息一下，准备好了再继续。", "继续游戏");
    } else {
      hideMessage();
    }
  }

  function winGame() {
    if (state.ended) return;
    state.won = true;
    endGame(true);
  }

  function endGame(won) {
    if (state.ended) return;
    state.ended = true;
    state.running = false;
    state.paused = false;
    state.best = Math.max(state.best, state.score);
    saveBest();
    updateHud();
    if (won) {
      showMessage("合成 2048", `太棒了，分数 ${state.score}。`, "再玩一局");
    } else {
      showMessage("差一点点", `最高泡泡 ${highestBubble()}，再试一次。`, "重新开始");
    }
  }

  function updateHud() {
    scoreEl.textContent = state.score.toString();
    bestEl.textContent = state.best.toString();
    targetEl.textContent = targetValue.toString();
    mergeCountEl.textContent = state.mergeTools.toString();
    clearCountEl.textContent = state.clearTools.toString();
    mergeTool.disabled = state.mergeTools <= 0 || !state.running || state.paused;
    clearTool.disabled = state.clearTools <= 0 || !state.running || state.paused;
    pauseButton.disabled = !state.running || state.ended;
  }

  function showMessage(title, text, action) {
    messageTitle.textContent = title;
    messageText.textContent = text;
    primaryAction.textContent = action;
    updateModeSelector();
    message.classList.remove("hidden");
  }

  function hideMessage() {
    message.classList.add("hidden");
  }

  function selectMode(mode) {
    if (state.running && !state.ended) return;
    state.mode = mode;
    saveBest();
    updateModeSelector();
    showMessage("泡泡 2048", modeIntroText(), "开始游戏");
  }

  function updateModeSelector() {
    if (!modeSelector) return;
    const canChoose = !state.running || state.ended;
    modeSelector.classList.toggle("hidden", !canChoose);
    basicMode.classList.toggle("active", state.mode === "basic");
    advancedMode.classList.toggle("active", state.mode === "advanced");
    basicMode.setAttribute("aria-pressed", state.mode === "basic" ? "true" : "false");
    advancedMode.setAttribute("aria-pressed", state.mode === "advanced" ? "true" : "false");
  }

  function modeIntroText() {
    if (state.mode === "advanced") return "进阶版：算出加减法答案，合成对应数字气球。";
    return "基础班：按数字小目标合成，先练数字和翻倍。";
  }

  function draw() {
    const sx = state.shake ? (Math.random() - 0.5) * state.shake * 6 : 0;
    const sy = state.shake ? (Math.random() - 0.5) * state.shake * 5 : 0;
    ctx.save();
    ctx.clearRect(0, 0, state.width, state.height);
    ctx.translate(sx, sy);
    drawBackground();
    drawDangerLine();
    drawGoalBadge();
    drawTargetHighlights();
    drawManualGuide();

    for (const bubble of state.bubbles) {
      drawBubble(bubble);
    }

    if (state.projectile) {
      drawBubble(state.projectile);
    }

    drawParticles();
    drawPopups();
    drawLauncher();
    drawNextBubble();
    drawCombo();
    ctx.restore();
  }

  function drawBackground() {
    const gradient = ctx.createLinearGradient(0, 0, 0, state.height);
    gradient.addColorStop(0, "#dff8ff");
    gradient.addColorStop(0.58, "#bfefff");
    gradient.addColorStop(1, "#e6ffe9");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, state.width, state.height);

    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < 8; i += 1) {
      const x = ((i * 97 + 35) % Math.max(1, state.width)) + Math.sin(performance.now() / 1400 + i) * 16;
      const y = ((i * 131 + 24) % Math.max(1, state.height - 90)) + 18;
      ctx.beginPath();
      ctx.arc(x, y, 10 + (i % 4) * 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawDangerLine() {
    ctx.save();
    ctx.setLineDash([8, 8]);
    ctx.strokeStyle = "rgba(239, 91, 104, 0.75)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(14, state.dangerY);
    ctx.lineTo(state.width - 14, state.dangerY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(239, 91, 104, 0.92)";
    ctx.font = "800 12px ui-rounded, system-ui";
    ctx.textAlign = "right";
    ctx.fillText("安全线", state.width - 16, state.dangerY - 8);
    ctx.restore();
  }

  function drawGoalBadge() {
    if (!state.running) return;
    const label = state.mode === "advanced" ? `算一算 ${state.goal.expression}=?` : `小目标 ${state.goal.value}`;
    const width = Math.min(state.mode === "advanced" ? 260 : 205, state.width - 28);
    const height = 42;
    const x = 14;
    const y = clamp(state.dangerY - height - state.radius * 0.8, state.height * 0.48, state.height - height - 80);
    const flash = state.goal.flash;

    ctx.save();
    ctx.globalAlpha = 0.88;
    ctx.fillStyle = flash > 0 ? "rgba(255, 248, 211, 0.96)" : "rgba(255, 255, 255, 0.78)";
    ctx.strokeStyle = flash > 0 ? "rgba(255, 200, 87, 0.86)" : "rgba(23, 49, 79, 0.12)";
    ctx.lineWidth = 1.5;
    roundedRect(x, y, width, height, 9);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#17314f";
    ctx.font = "900 14px ui-rounded, system-ui";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x + 12, y + height / 2);

    const dotStart = x + width - state.goal.need * 18 - 12;
    for (let i = 0; i < state.goal.need; i += 1) {
      ctx.beginPath();
      ctx.fillStyle = i < state.goal.progress ? "#35c46a" : "rgba(23, 49, 79, 0.16)";
      ctx.arc(dotStart + i * 18, y + height / 2, 5.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawCombo() {
    if (state.combo.count < 2 || performance.now() > state.combo.showUntil) return;
    const remaining = (state.combo.showUntil - performance.now()) / 1300;
    ctx.save();
    ctx.globalAlpha = clamp(remaining * 1.35, 0, 1);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `900 ${clamp(state.radius * 1.0 + state.combo.count * 1.5, 24, 38)}px ui-rounded, system-ui`;
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.86)";
    ctx.fillStyle = "#ffc857";
    ctx.shadowColor = "rgba(23, 49, 79, 0.22)";
    ctx.shadowBlur = 8;
    ctx.strokeText(`连击 x${state.combo.count}`, state.width / 2, state.height * 0.17);
    ctx.fillText(`连击 x${state.combo.count}`, state.width / 2, state.height * 0.17);
    ctx.restore();
  }

  function drawTargetHighlights() {
    const value = activeMatchValue();
    if (!value) return;
    const now = performance.now() / 1000;
    const pulse = (Math.sin(now * 5) + 1) * 0.5;
    ctx.save();
    for (const bubble of state.bubbles) {
      if (bubble.value !== value) continue;
      ctx.globalAlpha = 0.28 + pulse * 0.22;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3 + pulse * 2;
      ctx.beginPath();
      ctx.arc(bubble.x, bubble.y, bubble.r + 7 + pulse * 4, 0, Math.PI * 2);
      ctx.stroke();

      ctx.globalAlpha = 0.22 + pulse * 0.18;
      ctx.strokeStyle = "rgba(255, 200, 87, 0.95)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(bubble.x, bubble.y, bubble.r + 13 + pulse * 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawManualGuide() {
    if (!state.manual.active) return;
    const bubble = getManualBubble();
    if (!bubble) return;
    const target = getManualTarget();
    ctx.save();
    ctx.globalAlpha = 0.72;
    ctx.strokeStyle = "rgba(53, 196, 106, 0.55)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(bubble.x, bubble.y, bubble.r + 8, 0, Math.PI * 2);
    ctx.stroke();

    if (target) {
      ctx.globalAlpha = 0.42;
      ctx.strokeStyle = "rgba(53, 196, 106, 0.9)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(bubble.x, bubble.y);
      ctx.lineTo(target.x, target.y);
      ctx.stroke();

      ctx.globalAlpha = 0.82;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(target.x, target.y, target.r + 10, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawLauncher() {
    const y = state.height - state.radius * 1.35;
    const x = clamp(state.launcherX, state.radius + 8, state.width - state.radius - 8);
    const charge = state.inflate.active ? state.inflate.value : state.inflate.release;

    ctx.save();
    ctx.fillStyle = "rgba(23, 49, 79, 0.12)";
    ctx.beginPath();
    ctx.ellipse(x, y + state.radius * 0.86, state.radius * 1.7, state.radius * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "rgba(23, 49, 79, 0.18)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y + state.radius * 0.38, state.radius * 1.02, Math.PI, 0);
    ctx.lineTo(x + state.radius * 1.02, y + state.radius * 0.72);
    ctx.lineTo(x - state.radius * 1.02, y + state.radius * 0.72);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    if (charge > 0.05 && !state.projectile) {
      drawFloatBubbles(x, y - state.radius * 0.65, charge);
    }
  }

  function drawNextBubble() {
    if (state.projectile || !state.running) return;
    const charging = state.inflate.active && state.aim && !state.paused;
    const charge = charging ? state.inflate.value : state.inflate.release;
    const value = chargedValue(state.nextValue, charge);
    const bubble = {
      x: clamp(state.launcherX, state.radius + 8, state.width - state.radius - 8),
      y: state.height - state.radius * 1.35,
      r: radiusForValue(value),
      value,
      pulse: Math.sin(performance.now() / 280) * 0.02 + 0.06 + chargeStep(charge) * 0.05,
      inflate: charge,
    };
    if (charge > 0.02) {
      drawInflateHalo(bubble.x, bubble.y, bubble.r, charge);
    }
    drawBubble(bubble);
  }

  function drawBubble(bubble) {
    const colors = colorFor(bubble.value);
    const pulse = bubble.pulse ? 1 + Math.sin(bubble.pulse * Math.PI * 4) * 0.08 + bubble.pulse * 0.12 : 1;
    const inflate = bubble.inflate || 0;
    const wobble = inflate ? Math.sin(performance.now() / 82 + bubble.x * 0.03) * inflate * 0.045 : 0;
    const r = bubble.r * pulse;
    const rx = r * (1 + inflate * 0.14 + wobble);
    const ry = r * (1 + inflate * 0.27 - wobble * 0.45);
    const glow = Math.max(rx, ry);
    const gradient = ctx.createRadialGradient(bubble.x - rx * 0.35, bubble.y - ry * 0.42, glow * 0.15, bubble.x, bubble.y, glow);
    gradient.addColorStop(0, blendHex(colors[0], "#ffffff", 0.24));
    gradient.addColorStop(0.55, colors[0]);
    gradient.addColorStop(1, blendHex(colors[1], "#17314f", 0.1));

    ctx.save();
    ctx.shadowColor = "rgba(23, 49, 79, 0.2)";
    ctx.shadowBlur = 9 + inflate * 8;
    ctx.shadowOffsetY = 5 + inflate * 2;
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(bubble.x, bubble.y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowColor = "transparent";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.84)";
    ctx.lineWidth = Math.max(2, Math.min(rx, ry) * 0.09);
    ctx.stroke();

    ctx.globalAlpha = 0.42;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.72)";
    ctx.lineWidth = Math.max(2, Math.min(rx, ry) * 0.075);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.ellipse(
      bubble.x - rx * 0.24,
      bubble.y - ry * 0.27,
      rx * 0.23,
      ry * 0.1,
      -0.65,
      Math.PI * 0.9,
      Math.PI * 1.72
    );
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.fillStyle = colors[1];
    ctx.globalAlpha = 0.88;
    ctx.beginPath();
    ctx.moveTo(bubble.x - rx * 0.18, bubble.y + ry * 0.78);
    ctx.lineTo(bubble.x + rx * 0.18, bubble.y + ry * 0.78);
    ctx.lineTo(bubble.x, bubble.y + ry * 1.08);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = textColorFor(bubble.value);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `900 ${fontSizeFor(bubble.value, Math.min(rx, ry))}px ui-rounded, system-ui`;
    ctx.shadowColor = "rgba(23, 49, 79, 0.18)";
    ctx.shadowBlur = 2;
    ctx.shadowOffsetY = 2;
    ctx.lineWidth = Math.max(1.25, Math.min(rx, ry) * 0.035);
    ctx.strokeStyle = "rgba(23, 49, 79, 0.12)";
    ctx.strokeText(String(bubble.value), bubble.x, bubble.y - ry * 0.03);
    ctx.fillText(String(bubble.value), bubble.x, bubble.y - ry * 0.03);
    ctx.restore();
  }

  function drawInflateHalo(x, y, r, charge) {
    ctx.save();
    ctx.globalAlpha = 0.18 + charge * 0.26;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2 + charge * 3;
    ctx.beginPath();
    ctx.arc(x, y, r * (1.18 + charge * 0.58), 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = 0.24 + charge * 0.2;
    ctx.strokeStyle = "rgba(23, 49, 79, 0.22)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r * (0.92 + charge * 0.26), Math.PI * 0.18, Math.PI * 0.72);
    ctx.stroke();
    ctx.restore();
  }

  function drawFloatBubbles(x, y, charge) {
    const now = performance.now() / 1000;
    ctx.save();
    for (let i = 0; i < 5; i += 1) {
      const t = (now * 0.65 + i * 0.2) % 1;
      const drift = Math.sin(now * 1.8 + i * 1.7) * state.radius * 0.35;
      const dotR = state.radius * (0.07 + charge * 0.08) * (1 - t * 0.45);
      ctx.globalAlpha = (0.32 + charge * 0.34) * (1 - t);
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(x + drift, y - t * state.radius * 2.8, dotR, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawParticles() {
    ctx.save();
    for (const particle of state.particles) {
      ctx.globalAlpha = clamp(particle.life * 2.5, 0, 1);
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPopups() {
    ctx.save();
    for (const popup of state.popups) {
      const alpha = clamp(popup.life / popup.maxLife, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `900 ${clamp(state.radius * 0.48, 13, 18)}px ui-rounded, system-ui`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(23, 49, 79, 0.22)";
      ctx.fillStyle = popup.color;
      ctx.strokeText(popup.text, popup.x, popup.y);
      ctx.fillText(popup.text, popup.x, popup.y);
    }
    ctx.restore();
  }

  function colorFor(value) {
    return palette[value] || ["#ffffff", "#17314f"];
  }

  function blendHex(from, to, amount) {
    const a = hexToRgb(from);
    const b = hexToRgb(to);
    if (!a || !b) return from;
    const r = Math.round(a.r + (b.r - a.r) * amount);
    const g = Math.round(a.g + (b.g - a.g) * amount);
    const blue = Math.round(a.b + (b.b - a.b) * amount);
    return `rgb(${r}, ${g}, ${blue})`;
  }

  function hexToRgb(hex) {
    const clean = hex.replace("#", "");
    if (clean.length !== 6) return null;
    const value = Number.parseInt(clean, 16);
    return {
      r: (value >> 16) & 255,
      g: (value >> 8) & 255,
      b: value & 255,
    };
  }

  function textColorFor(value) {
    return value >= 2048 || value === 512 || value === 1024 ? "#17314f" : "#ffffff";
  }

  function fontSizeFor(value, r) {
    const length = String(value).length;
    if (length >= 4) return r * 0.58;
    if (length === 3) return r * 0.72;
    return r * 0.9;
  }

  function chargeStep(charge) {
    if (charge >= 0.84) return 4;
    if (charge >= 0.62) return 3;
    if (charge >= 0.4) return 2;
    if (charge >= 0.2) return 1;
    return 0;
  }

  function chargedValue(base, charge) {
    return base * 2 ** chargeStep(charge);
  }

  function activeMatchValue() {
    const manualBubble = getManualBubble();
    if (state.manual.active && manualBubble) return manualBubble.value;
    if (state.projectile) return state.projectile.value;
    if (state.inflate.active && state.aim && !state.paused) {
      return chargedValue(state.nextValue, state.inflate.value);
    }
    return 0;
  }

  function highestBubble() {
    let highest = 0;
    for (const bubble of state.bubbles) {
      highest = Math.max(highest, bubble.value);
    }
    if (state.projectile) highest = Math.max(highest, state.projectile.value);
    return highest;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function roundedRect(x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
  }

  function radiusForValue(value) {
    const step = Math.max(0, Math.log2(Math.max(2, value)) - 1);
    return state.radius * clamp(1 + step * 0.075, 1, 1.62);
  }

  function findBubbleAt(point) {
    for (let i = state.bubbles.length - 1; i >= 0; i -= 1) {
      const bubble = state.bubbles[i];
      if (Math.hypot(point.x - bubble.x, point.y - bubble.y) <= bubble.r * 1.15) {
        return bubble;
      }
    }
    return null;
  }

  function pointFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: clamp(event.clientX - rect.left, 0, state.width),
      y: clamp(event.clientY - rect.top, 0, state.height),
    };
  }

  function onPointerDown(event) {
    if (!state.running || state.paused || state.projectile) return;
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch (error) {
      // Synthetic pointer events used by tests may not be capturable.
    }
    const point = pointFromEvent(event);
    const bubble = findBubbleAt(point);
    if (bubble) {
      state.manual.active = true;
      state.manual.bubbleId = bubble.id;
      state.manual.targetId = null;
      state.manual.offsetX = bubble.x - point.x;
      state.manual.offsetY = bubble.y - point.y;
      state.manual.moved = false;
      bubble.pulse = 0.22;
      state.aim = null;
      state.inflate.active = false;
      state.inflate.startedAt = 0;
      return;
    }

    state.launcherX = point.x;
    state.aim = point;
    state.inflate.active = true;
    state.inflate.value = 0.08;
    state.inflate.release = 0;
    state.inflate.startX = point.x;
    state.inflate.lastX = point.x;
    state.inflate.startedAt = performance.now();
  }

  function onPointerMove(event) {
    if (state.manual.active) {
      const bubble = getManualBubble();
      if (!bubble) {
        resetManualDrag();
        return;
      }
      const point = pointFromEvent(event);
      bubble.x = clamp(point.x + state.manual.offsetX, bubble.r + 8, state.width - bubble.r - 8);
      bubble.y = clamp(point.y + state.manual.offsetY, bubble.r + 8, state.dangerY - bubble.r - 14);
      bubble.vx = 0;
      bubble.vy = 0;
      bubble.pulse = Math.max(bubble.pulse, 0.18);
      const target = findManualTarget(bubble);
      state.manual.targetId = target ? target.id : null;
      state.manual.moved = true;
      return;
    }

    if (!state.running || state.paused || state.projectile || !state.aim) return;
    state.aim = pointFromEvent(event);
    state.inflate.lastX = state.aim.x;
    state.launcherX = clamp(state.aim.x, state.radius + 8, state.width - state.radius - 8);
  }

  function onPointerUp(event) {
    if (state.manual.active) {
      finishManualDrag();
      return;
    }

    if (!state.aim) return;
    const point = pointFromEvent(event);
    syncInflation();
    const charge = state.inflate.value;
    state.inflate.active = false;
    state.inflate.release = charge;
    state.inflate.startedAt = 0;
    launch(point, charge);
  }

  function finishManualDrag() {
    const bubble = getManualBubble();
    const target = bubble ? getManualTarget() || findManualTarget(bubble) : null;
    if (bubble && target) {
      manualMerge(bubble, target);
    } else if (bubble) {
      bubble.pulse = Math.max(bubble.pulse, 0.28);
      resolveOverlaps();
    }
    resetManualDrag();
  }

  function resetManualDrag() {
    state.manual.active = false;
    state.manual.bubbleId = null;
    state.manual.targetId = null;
    state.manual.moved = false;
  }

  function loop(timestamp) {
    if (!state.lastTime) state.lastTime = timestamp;
    const dt = Math.min(0.033, (timestamp - state.lastTime) / 1000);
    state.lastTime = timestamp;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  primaryAction.addEventListener("click", () => {
    if (state.paused) {
      togglePause();
      return;
    }
    startGame();
  });
  basicMode.addEventListener("click", () => selectMode("basic"));
  advancedMode.addEventListener("click", () => selectMode("advanced"));
  pauseButton.addEventListener("click", togglePause);
  mergeTool.addEventListener("click", useMergeTool);
  clearTool.addEventListener("click", useClearTool);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", () => {
    state.aim = null;
    resetManualDrag();
    state.inflate.active = false;
    state.inflate.startedAt = 0;
  });
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", () => setTimeout(resize, 80));

  loadSave();
  resize();
  updateHud();
  updateModeSelector();
  showMessage("泡泡 2048", modeIntroText(), "开始游戏");
  requestAnimationFrame(loop);
})();
