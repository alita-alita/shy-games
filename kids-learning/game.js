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
    resolving: false,
    toastTimer: 0,
    speechToken: 0,
    voices: [],
    voice: null,
    audioContext: null,
  };

  function init() {
    bindEvents();
    primeVoices();
    newTask();
  }

  function bindEvents() {
    listenButton.addEventListener("click", () => speakTask());
    nextButton.addEventListener("click", () => newTask());
    hanziMode.addEventListener("click", () => setMode("hanzi"));
    mathMode.addEventListener("click", () => setMode("math"));
    window.addEventListener("resize", () => layoutBalloons());
    if ("speechSynthesis" in window && typeof window.speechSynthesis.addEventListener === "function") {
      window.speechSynthesis.addEventListener("voiceschanged", primeVoices);
    } else if ("speechSynthesis" in window) {
      window.speechSynthesis.onvoiceschanged = primeVoices;
    }
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
    state.resolving = false;
    modeLabel.textContent = state.mode === "hanzi" ? "认汉字" : "20以内加减法";
    renderTaskTitle(state.task);
    taskHint.textContent = state.task.hint;
    targetText.textContent = state.task.target;
    listenButton.textContent = "听题";
    targetZone.classList.remove("hot", "success", "hint");
    targetZone.setAttribute("aria-label", `答案区：${state.task.target}`);
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
        title: "找",
        focus: answer,
        hint: `组词：${pair.word}`,
        target: pair.word,
        readParts: ["组词", pair.word, `请找 ${answer}`],
        successParts: ["答对了", `${answer} 是 ${pair.word} 里的字`],
        options: shuffle([answer, ...sampleMany(distractors, 5)]),
      };
    }

    const item = sample(HANZI_ITEMS);
    const sameGroup = HANZI_ITEMS.filter((candidate) => candidate.group === item.group && candidate.char !== item.char);
    const rest = HANZI_ITEMS.filter((candidate) => candidate.char !== item.char && candidate.group !== item.group);
    return {
      type,
      answer: item.char,
      title: "找",
      focus: item.char,
      hint: `${item.word}  ${item.pinyin}`,
      target: item.char,
      readParts: ["请找", item.char, item.word],
      successParts: ["答对了", `${item.char}，${item.word}`],
      options: shuffle([item.char, ...sampleMany(sameGroup, 2).map((entry) => entry.char), ...sampleMany(rest, 3).map((entry) => entry.char)]),
    };
  }

  function makeMathTask() {
    const addition = Math.random() > 0.45;
    let a;
    let b;
    let answer;
    let expression;
    let operation;

    if (addition) {
      answer = randomInt(5, 20);
      a = randomInt(1, answer - 1);
      b = answer - a;
      expression = `${a} + ${b}`;
      operation = "加";
    } else {
      answer = randomInt(1, 18);
      b = randomInt(1, 20 - answer);
      a = answer + b;
      expression = `${a} - ${b}`;
      operation = "减";
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
      readParts: ["请算一算", `${numberToChinese(a)} ${operation} ${numberToChinese(b)}`, "等于几"],
      successParts: ["答对了", `${numberToChinese(a)} ${operation} ${numberToChinese(b)} 等于 ${numberToChinese(answer)}`],
      options: shuffle([...options].map(String)),
    };
  }

  function renderTaskTitle(task) {
    taskTitle.replaceChildren();
    taskTitle.classList.toggle("has-focus", Boolean(task.focus));
    if (!task.focus) {
      taskTitle.textContent = task.title;
      taskTitle.removeAttribute("aria-label");
      return;
    }

    const prefix = document.createElement("span");
    const focus = document.createElement("span");
    prefix.className = "title-prefix";
    focus.className = "focus-char";
    prefix.textContent = task.title;
    focus.textContent = task.focus;
    taskTitle.append(prefix, focus);
    taskTitle.setAttribute("aria-label", `${task.title} ${task.focus}`);
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
        homeX: 0,
        homeY: 0,
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
      el.style.setProperty("--bob-delay", `${(-index * 0.28).toFixed(2)}s`);
      el.setAttribute("aria-label", `${value} 气球`);
      el.addEventListener("pointerdown", (event) => startDrag(event, balloon));
      el.addEventListener("mousedown", (event) => startDrag(event, balloon));
      el.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        chooseBalloon(balloon);
      });
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
      balloon.homeX = balloon.x;
      balloon.homeY = balloon.y;
      applyBalloonPosition(balloon);
    });
  }

  function startDrag(event, balloon) {
    if (state.drag || state.resolving) return;
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
      startX: point.x,
      startY: point.y,
      moved: false,
    };
    balloon.el.classList.remove("wrong");
    balloon.el.classList.add("dragging");
    targetZone.classList.add("ready");
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
    const dx = point.x - state.drag.startX;
    const dy = point.y - state.drag.startY;
    if (Math.hypot(dx, dy) > 9) state.drag.moved = true;
    balloon.x = clamp(point.x + state.drag.offsetX, 8, rect.width - balloon.size - 8);
    balloon.y = clamp(point.y + state.drag.offsetY, 8, rect.height - balloon.size - 16);
    applyBalloonPosition(balloon);
    targetZone.classList.toggle("hot", isOverTarget(balloon));
  }

  function dragEnd(event) {
    if (!isDragEvent(event)) return;
    const balloon = state.drag.balloon;
    const moved = state.drag.moved;
    const droppedInTarget = isOverTarget(balloon);
    balloon.el.classList.remove("dragging");
    document.removeEventListener("pointermove", dragMove);
    document.removeEventListener("pointerup", dragEnd);
    document.removeEventListener("pointercancel", dragEnd);
    document.removeEventListener("mousemove", dragMove);
    document.removeEventListener("mouseup", dragEnd);
    targetZone.classList.remove("hot", "ready");

    state.drag = null;
    if (event.type === "pointercancel") {
      returnBalloon(balloon);
    } else if (!moved || droppedInTarget) {
      chooseBalloon(balloon);
    } else {
      returnBalloon(balloon);
      showToast("放进答案框里试试");
    }
  }

  function isDragEvent(event) {
    if (!state.drag) return false;
    if (state.drag.pointerId === "mouse") return event.pointerId === undefined || event.type.startsWith("mouse");
    return event.pointerId === state.drag.pointerId;
  }

  function chooseBalloon(balloon) {
    if (state.resolving) return;
    if (String(balloon.value) === String(state.task.answer)) {
      state.resolving = true;
      flyBalloonToTarget(balloon, () => handleCorrect(balloon));
    } else {
      handleWrong(balloon);
    }
  }

  function flyBalloonToTarget(balloon, done) {
    const field = playfield.getBoundingClientRect();
    const target = targetZone.getBoundingClientRect();
    balloon.x = target.left - field.left + target.width / 2 - balloon.size / 2;
    balloon.y = target.top - field.top + target.height / 2 - balloon.size / 2;
    balloon.el.classList.add("chosen");
    targetZone.classList.add("hot");
    applyBalloonPosition(balloon);
    window.setTimeout(done, 230);
  }

  function returnBalloon(balloon) {
    balloon.x = balloon.homeX;
    balloon.y = balloon.homeY;
    balloon.el.classList.remove("chosen");
    applyBalloonPosition(balloon);
  }

  function handleCorrect(balloon) {
    targetZone.classList.remove("hot");
    targetZone.classList.add("success");
    balloon.el.classList.add("correct");
    state.streak += 1;
    state.stars += state.streak >= 3 ? 2 : 1;
    state.round += 1;
    showToast(state.streak >= 3 ? `连续答对 ${state.streak}` : "太棒了");
    createSparkles(balloon);
    playFeedback("correct");
    speak(state.task.successParts || ["答对了"]);
    updateHud();
    window.setTimeout(() => newTask(), 650);
  }

  function handleWrong(balloon) {
    state.streak = 0;
    state.resolving = false;
    balloon.el.classList.remove("wrong");
    void balloon.el.offsetWidth;
    balloon.el.classList.add("wrong");
    targetZone.classList.add("hint");
    showToast("再想一想");
    playFeedback("wrong");
    speak(["再想一想", "可以再听一遍"]);
    updateHud();
    window.setTimeout(() => {
      balloon.el.classList.remove("wrong");
      targetZone.classList.remove("hint");
      returnBalloon(balloon);
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
    speak(state.task.readParts || state.task.readText);
  }

  function speak(parts) {
    if (!("speechSynthesis" in window)) return;
    const queue = normalizeSpeechParts(parts);
    if (!queue.length) return;
    primeVoices();
    const token = state.speechToken + 1;
    state.speechToken = token;
    window.speechSynthesis.cancel();
    listenButton.classList.add("speaking");
    listenButton.textContent = "读题";

    const speakNext = (index) => {
      if (state.speechToken !== token) return;
      if (index >= queue.length) {
        finishSpeaking(token);
        return;
      }
      const item = queue[index];
      const utterance = new SpeechSynthesisUtterance(item.text);
      utterance.lang = "zh-CN";
      utterance.voice = state.voice;
      utterance.rate = item.rate || 0.74;
      utterance.pitch = item.pitch || 0.98;
      utterance.volume = 1;
      utterance.onend = () => window.setTimeout(() => speakNext(index + 1), item.pause || 150);
      utterance.onerror = () => window.setTimeout(() => speakNext(index + 1), 90);
      window.speechSynthesis.speak(utterance);
    };

    speakNext(0);
  }

  function finishSpeaking(token) {
    if (state.speechToken !== token) return;
    listenButton.classList.remove("speaking");
    listenButton.textContent = "听题";
  }

  function normalizeSpeechParts(parts) {
    const list = Array.isArray(parts) ? parts : [parts];
    return list
      .map((part) => (typeof part === "string" ? { text: part } : part))
      .filter((part) => part && part.text && part.text.trim())
      .map((part) => ({ ...part, text: part.text.trim() }));
  }

  function primeVoices() {
    if (!("speechSynthesis" in window)) return;
    state.voices = window.speechSynthesis.getVoices();
    state.voice = pickChineseVoice(state.voices);
  }

  function pickChineseVoice(voices) {
    const preferredNames = ["Xiaoxiao", "Tingting", "Ting-Ting", "Mei-Jia", "Meijia", "婷婷", "晓晓", "普通话", "Mandarin"];
    const chineseVoices = voices.filter((voice) => /zh|cmn/i.test(voice.lang) || /Chinese|Mandarin|Ting|Xiao|Mei|普通话|中文/.test(voice.name));
    return (
      preferredNames.map((name) => chineseVoices.find((voice) => voice.name.includes(name))).find(Boolean) ||
      chineseVoices.find((voice) => voice.lang === "zh-CN") ||
      chineseVoices[0] ||
      null
    );
  }

  function playFeedback(type) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    if (!state.audioContext) state.audioContext = new AudioContext();
    const context = state.audioContext;
    context.resume();
    const notes = type === "correct" ? [523, 659, 784] : [220, 196];
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime + index * 0.075;
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(type === "correct" ? 0.08 : 0.045, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.14);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.16);
    });
    if ("vibrate" in navigator) navigator.vibrate(type === "correct" ? 28 : 16);
  }

  function createSparkles(balloon) {
    const centerX = balloon.x + balloon.size / 2;
    const centerY = balloon.y + balloon.size / 2;
    for (let index = 0; index < 9; index += 1) {
      const sparkle = document.createElement("span");
      const angle = (Math.PI * 2 * index) / 9;
      const distance = 34 + (index % 3) * 13;
      sparkle.className = "sparkle";
      sparkle.style.left = `${centerX}px`;
      sparkle.style.top = `${centerY}px`;
      sparkle.style.setProperty("--dx", `${Math.cos(angle) * distance}px`);
      sparkle.style.setProperty("--dy", `${Math.sin(angle) * distance}px`);
      sparkle.style.setProperty("--delay", `${index * 18}ms`);
      playfield.appendChild(sparkle);
      window.setTimeout(() => sparkle.remove(), 780);
    }
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

  function numberToChinese(value) {
    const words = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
    if (value <= 10) return words[value];
    if (value < 20) return `十${words[value - 10]}`;
    return "二十";
  }

  function sizeForNumber(value) {
    return clamp(62 + value * 1.8, 66, 96);
  }

  init();
})();
