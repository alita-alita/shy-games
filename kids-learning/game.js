(function () {
  "use strict";

  const playfield = document.getElementById("playfield");
  const balloonLayer = document.getElementById("balloonLayer");
  const targetZone = document.getElementById("targetZone");
  const targetText = document.getElementById("targetText");
  const toast = document.getElementById("toast");
  const starsEl = document.getElementById("stars");
  const roundEl = document.getElementById("round");
  const streakEl = document.getElementById("streak");
  const modeLabel = document.getElementById("modeLabel");
  const taskTitle = document.getElementById("taskTitle");
  const taskHint = document.getElementById("taskHint");
  const listenButton = document.getElementById("listenButton");
  const hanziMode = document.getElementById("hanziMode");
  const mathMode = document.getElementById("mathMode");
  const nextButton = document.getElementById("nextButton");

  const colors = [
    ["#8fe7ff", "#36b9ef"],
    ["#a7f2c1", "#36c96e"],
    ["#ffe797", "#ffc857"],
    ["#ffbc8e", "#ff8150"],
    ["#d7a5ff", "#8d72ff"],
    ["#9fb5ff", "#5b76e8"],
  ];

  const state = {
    mode: "hanzi",
    round: 1,
    stars: 0,
    streak: 0,
    task: null,
    balloons: [],
    drag: null,
    toastTimer: 0,
  };

  function init() {
    bindEvents();
    newTask();
  }

  function bindEvents() {
    listenButton.addEventListener("click", () => speakTask());
    nextButton.addEventListener("click", () => newTask());
    hanziMode.addEventListener("click", () => setMode("hanzi"));
    mathMode.addEventListener("click", () => setMode("math"));
    window.addEventListener("resize", () => layoutBalloons());
  }

  function setMode(mode) {
    state.mode = mode;
    hanziMode.classList.toggle("active", mode === "hanzi");
    mathMode.classList.toggle("active", mode === "math");
    state.round = 1;
    state.streak = 0;
    newTask();
  }

  function newTask() {
    state.task = state.mode === "hanzi" ? makeHanziTask() : makeMathTask();
    modeLabel.textContent = state.mode === "hanzi" ? "认汉字" : "20以内加减法";
    taskTitle.textContent = state.task.title;
    taskHint.textContent = state.task.hint;
    targetText.textContent = state.task.target;
    clearBalloons();
    makeBalloons(state.task.options);
    updateHud();
    window.setTimeout(() => speakTask(), 220);
  }

  function makeHanziTask() {
    const type = Math.random() > 0.35 ? "find" : "word";
    if (type === "word") {
      const pair = sample(WORD_PAIRS);
      const answer = pair.parts[Math.floor(Math.random() * pair.parts.length)];
      const distractors = HANZI_ITEMS.map((item) => item.char).filter((char) => !pair.parts.includes(char));
      return {
        type,
        answer,
        title: `组词：${pair.word}`,
        hint: `找出 “${answer}”`,
        target: pair.word,
        readText: `${pair.word}，找 ${answer}`,
        options: shuffle([answer, ...sampleMany(distractors, 5)]),
      };
    }

    const item = sample(HANZI_ITEMS);
    const sameGroup = HANZI_ITEMS.filter((candidate) => candidate.group === item.group && candidate.char !== item.char);
    const rest = HANZI_ITEMS.filter((candidate) => candidate.char !== item.char && candidate.group !== item.group);
    return {
      type,
      answer: item.char,
      title: "找一找",
      hint: `${item.word}  ${item.pinyin}`,
      target: item.char,
      readText: `${item.char}，${item.word}`,
      options: shuffle([item.char, ...sampleMany(sameGroup, 2).map((entry) => entry.char), ...sampleMany(rest, 3).map((entry) => entry.char)]),
    };
  }

  function makeMathTask() {
    const addition = Math.random() > 0.45;
    let a;
    let b;
    let answer;
    let expression;

    if (addition) {
      answer = randomInt(5, 20);
      a = randomInt(1, answer - 1);
      b = answer - a;
      expression = `${a} + ${b}`;
    } else {
      answer = randomInt(1, 18);
      b = randomInt(1, 20 - answer);
      a = answer + b;
      expression = `${a} - ${b}`;
    }

    const options = new Set([answer]);
    while (options.size < 6) {
      const delta = randomInt(-5, 5);
      const candidate = clamp(answer + delta, 0, 20);
      options.add(candidate);
    }

    return {
      type: "math",
      answer: String(answer),
      title: "算一算",
      hint: expression,
      target: `${expression} = ?`,
      readText: `${expression} 等于几`,
      options: shuffle([...options].map(String)),
    };
  }

  function clearBalloons() {
    state.balloons = [];
    balloonLayer.replaceChildren();
    state.drag = null;
  }

  function makeBalloons(values) {
    const rect = playfield.getBoundingClientRect();
    values.forEach((value, index) => {
      const el = document.createElement("div");
      const color = colors[index % colors.length];
      const size = state.mode === "math" ? sizeForNumber(Number(value)) : 68 + (value.length > 1 ? 8 : 0);
      const balloon = {
        id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${index}`,
        value,
        el,
        size,
        x: 0,
        y: 0,
        floatSeed: Math.random() * Math.PI * 2,
      };

      el.className = "balloon";
      el.setAttribute("role", "button");
      el.tabIndex = 0;
      el.textContent = value;
      el.style.setProperty("--size", `${size}px`);
      el.style.setProperty("--font", `${Math.max(26, size * 0.45)}px`);
      el.style.setProperty("--c1", color[0]);
      el.style.setProperty("--c2", color[1]);
      el.setAttribute("aria-label", `${value} 气球`);
      el.addEventListener("pointerdown", (event) => startDrag(event, balloon));
      el.addEventListener("mousedown", (event) => startDrag(event, balloon));
      balloonLayer.appendChild(el);
      state.balloons.push(balloon);
    });
    layoutBalloons(rect);
  }

  function layoutBalloons(existingRect) {
    if (!state.balloons.length) return;
    const rect = existingRect || playfield.getBoundingClientRect();
    const cols = Math.min(3, Math.max(2, Math.floor(rect.width / 105)));
    const usableWidth = rect.width - 34;
    const rowGap = Math.max(88, rect.height * 0.14);
    state.balloons.forEach((balloon, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const cell = usableWidth / cols;
      const jitter = Math.sin(index * 1.7) * 10;
      balloon.x = 17 + col * cell + cell / 2 - balloon.size / 2 + jitter;
      balloon.y = 40 + row * rowGap + Math.cos(index * 2.3) * 8;
      applyBalloonPosition(balloon);
    });
  }

  function startDrag(event, balloon) {
    if (state.drag) return;
    if (event.type === "mousedown" && event.button !== 0) return;
    event.preventDefault();
    if (event.pointerId !== undefined && balloon.el.setPointerCapture) {
      try {
        balloon.el.setPointerCapture(event.pointerId);
      } catch (error) {
        // Mouse-driven browser automation may not support pointer capture.
      }
    }
    const point = pointFromEvent(event);
    state.drag = {
      balloon,
      pointerId: event.pointerId === undefined ? "mouse" : event.pointerId,
      offsetX: balloon.x - point.x,
      offsetY: balloon.y - point.y,
    };
    balloon.el.classList.add("dragging");
    document.addEventListener("pointermove", dragMove);
    document.addEventListener("pointerup", dragEnd);
    document.addEventListener("pointercancel", dragEnd);
    document.addEventListener("mousemove", dragMove);
    document.addEventListener("mouseup", dragEnd);
  }

  function dragMove(event) {
    if (!isDragEvent(event)) return;
    const rect = playfield.getBoundingClientRect();
    const point = pointFromEvent(event);
    const balloon = state.drag.balloon;
    balloon.x = clamp(point.x + state.drag.offsetX, 8, rect.width - balloon.size - 8);
    balloon.y = clamp(point.y + state.drag.offsetY, 8, rect.height - balloon.size - 16);
    applyBalloonPosition(balloon);
    targetZone.classList.toggle("hot", isOverTarget(balloon));
  }

  function dragEnd(event) {
    if (!isDragEvent(event)) return;
    const balloon = state.drag.balloon;
    balloon.el.classList.remove("dragging");
    document.removeEventListener("pointermove", dragMove);
    document.removeEventListener("pointerup", dragEnd);
    document.removeEventListener("pointercancel", dragEnd);
    document.removeEventListener("mousemove", dragMove);
    document.removeEventListener("mouseup", dragEnd);
    targetZone.classList.remove("hot");

    if (isOverTarget(balloon) && String(balloon.value) === String(state.task.answer)) {
      handleCorrect(balloon);
    } else {
      handleWrong(balloon);
    }
    state.drag = null;
  }

  function isDragEvent(event) {
    if (!state.drag) return false;
    if (state.drag.pointerId === "mouse") return event.pointerId === undefined || event.type.startsWith("mouse");
    return event.pointerId === state.drag.pointerId;
  }

  function handleCorrect(balloon) {
    balloon.el.classList.add("correct");
    state.streak += 1;
    state.stars += state.streak >= 3 ? 2 : 1;
    state.round += 1;
    showToast(state.streak >= 3 ? `连续答对 ${state.streak}` : "太棒了");
    speak(state.mode === "math" ? `答对了，${state.task.target.replace("?", state.task.answer)}` : `${state.task.answer}，答对了`);
    updateHud();
    window.setTimeout(() => newTask(), 650);
  }

  function handleWrong(balloon) {
    state.streak = 0;
    balloon.el.classList.remove("wrong");
    void balloon.el.offsetWidth;
    balloon.el.classList.add("wrong");
    showToast("再试一次");
    speak("再试一次");
    updateHud();
    window.setTimeout(() => {
      balloon.el.classList.remove("wrong");
      layoutBalloons();
    }, 380);
  }

  function isOverTarget(balloon) {
    const target = targetZone.getBoundingClientRect();
    const field = playfield.getBoundingClientRect();
    const centerX = field.left + balloon.x + balloon.size / 2;
    const centerY = field.top + balloon.y + balloon.size / 2;
    return centerX > target.left && centerX < target.right && centerY > target.top && centerY < target.bottom;
  }

  function pointFromEvent(event) {
    const rect = playfield.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  function applyBalloonPosition(balloon) {
    balloon.el.style.setProperty("--x", `${balloon.x}px`);
    balloon.el.style.setProperty("--y", `${balloon.y}px`);
  }

  function updateHud() {
    starsEl.textContent = state.stars.toString();
    roundEl.textContent = state.round.toString();
    streakEl.textContent = state.streak.toString();
  }

  function showToast(text) {
    toast.textContent = text;
    toast.classList.remove("hidden");
    window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => toast.classList.add("hidden"), 900);
  }

  function speakTask() {
    if (!state.task) return;
    speak(state.task.readText);
  }

  function speak(text) {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-CN";
    utterance.rate = 0.82;
    utterance.pitch = 1.08;
    window.speechSynthesis.speak(utterance);
  }

  function sample(items) {
    return items[Math.floor(Math.random() * items.length)];
  }

  function sampleMany(items, count) {
    return shuffle([...items]).slice(0, Math.min(count, items.length));
  }

  function shuffle(items) {
    for (let index = items.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      [items[index], items[swap]] = [items[swap], items[index]];
    }
    return items;
  }

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function sizeForNumber(value) {
    return clamp(62 + value * 1.8, 66, 96);
  }

  init();
})();
