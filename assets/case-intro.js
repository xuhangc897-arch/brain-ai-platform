(function (global) {
  "use strict";

  const SEEN_STORAGE_KEY = "case-intro-seen-v1";
  const CHARACTER_DELAY_MS = 70;
  const PARAGRAPH_DELAY_MS = 650;

  function create(options) {
    const settings = options || {};
    const platform = settings.platform || global.BrainPlatform;
    const stories = settings.stories || global.MemoryCaseStories;
    const backdropRoot = settings.backdropRoot || document.getElementById("experience");
    const reduceMotion = global.matchMedia("(prefers-reduced-motion: reduce)");
    const navigate = typeof settings.onNavigate === "function"
      ? settings.onNavigate
      : (route) => { global.location.href = route; };

    if (!platform || !platform.storage || typeof platform.storage.scopedKey !== "function") {
      throw new Error("CaseIntro requires BrainPlatform.storage.scopedKey.");
    }
    if (!stories || typeof stories.get !== "function") {
      throw new Error("CaseIntro requires MemoryCaseStories.");
    }

    const root = document.createElement("section");
    root.className = "case-intro";
    root.hidden = true;
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-labelledby", "caseIntroTitle");
    root.innerHTML = `
      <img class="case-intro-backdrop" src="assets/new-frontpage/首页静图-web.webp" alt="" width="1536" height="1024" decoding="async" />
      <div class="case-intro-shade" aria-hidden="true"></div>
      <div class="case-intro-texture" aria-hidden="true"></div>
      <button class="case-intro-return" type="button">← 返回案件列表</button>
      <button class="case-intro-skip" type="button">跳过剧情</button>
      <header class="case-intro-heading">
        <p class="case-intro-number"></p>
        <h2 class="case-intro-title" id="caseIntroTitle"></h2>
      </header>
      <div class="case-intro-avatar" aria-hidden="true">
        <span class="case-intro-pose case-intro-pose--normal"></span>
        <span class="case-intro-pose case-intro-pose--thinking"></span>
      </div>
      <section class="case-intro-log" aria-label="案件剧情记录">
        <div class="case-intro-copy">
          <p class="case-intro-kicker">MEMORY DETECTIVE LOG</p>
          <p class="case-intro-speaker">记忆侦探助手：</p>
          <div class="case-intro-dialog" aria-hidden="true"></div>
          <p class="case-intro-live" aria-live="polite"></p>
        </div>
        <div class="case-intro-actions">
          <button class="case-intro-start" type="button" disabled>档案解密中…</button>
        </div>
      </section>
    `;
    document.body.appendChild(root);

    const caseNumber = root.querySelector(".case-intro-number");
    const title = root.querySelector(".case-intro-title");
    const dialog = root.querySelector(".case-intro-dialog");
    const live = root.querySelector(".case-intro-live");
    const returnButton = root.querySelector(".case-intro-return");
    const skipButton = root.querySelector(".case-intro-skip");
    const startButton = root.querySelector(".case-intro-start");
    let activeStory = null;
    let activeRoute = "";
    let returnFocus = null;
    let runToken = 0;
    let waitTimer = null;
    let waitResolver = null;
    let backdropWasInert = false;

    function getStorageKey() {
      return platform.storage.scopedKey(SEEN_STORAGE_KEY);
    }

    function readSeenCases() {
      try {
        const saved = JSON.parse(global.localStorage.getItem(getStorageKey()) || "null");
        if (!saved || saved.version !== 1 || !saved.cases || typeof saved.cases !== "object") {
          return {};
        }
        return saved.cases;
      } catch (error) {
        return {};
      }
    }

    function hasSeen(caseId) {
      return Boolean(readSeenCases()[String(caseId || "")]);
    }

    function markSeen(caseId) {
      try {
        const cases = readSeenCases();
        cases[String(caseId || "")] = new Date().toISOString();
        global.localStorage.setItem(getStorageKey(), JSON.stringify({ version: 1, cases }));
      } catch (error) {
        // Storage failures must never block entry to an experiment.
      }
    }

    function setPose(pose) {
      root.classList.toggle("is-thinking", pose === "thinking");
    }

    function cancelPlayback() {
      runToken += 1;
      if (waitTimer !== null) {
        global.clearTimeout(waitTimer);
        waitTimer = null;
      }
      if (waitResolver) {
        const resolve = waitResolver;
        waitResolver = null;
        resolve(false);
      }
      dialog.querySelectorAll(".is-typing").forEach((line) => line.classList.remove("is-typing"));
    }

    function wait(milliseconds, token) {
      return new Promise((resolve) => {
        waitResolver = resolve;
        waitTimer = global.setTimeout(() => {
          waitTimer = null;
          waitResolver = null;
          resolve(token === runToken);
        }, milliseconds);
      });
    }

    function finishStory() {
      if (!activeStory) return;
      startButton.disabled = false;
      startButton.textContent = activeStory.buttonText;
      skipButton.hidden = true;
      live.textContent = "案件前情提要播放完毕，可以开始调查。";
      startButton.focus({ preventScroll: true });
    }

    function renderFullStory() {
      if (!activeStory) return;
      cancelPlayback();
      dialog.replaceChildren();
      activeStory.dialog.forEach((entry) => {
        const line = document.createElement("p");
        line.className = "case-intro-line";
        line.textContent = entry.text;
        dialog.appendChild(line);
      });
      setPose(activeStory.dialog.at(-1)?.pose);
      live.textContent = activeStory.dialog.map((entry) => entry.text).join(" ");
      finishStory();
    }

    async function playStory() {
      const token = ++runToken;
      for (let index = 0; index < activeStory.dialog.length; index += 1) {
        if (token !== runToken) return;
        const entry = activeStory.dialog[index];
        setPose(entry.pose);
        const line = document.createElement("p");
        line.className = "case-intro-line is-typing";
        dialog.appendChild(line);

        for (const character of Array.from(entry.text)) {
          if (token !== runToken) return;
          line.textContent += character;
          const shouldContinue = await wait(CHARACTER_DELAY_MS, token);
          if (!shouldContinue) return;
        }

        line.classList.remove("is-typing");
        live.textContent = entry.text;
        if (index < activeStory.dialog.length - 1) {
          const shouldContinue = await wait(PARAGRAPH_DELAY_MS, token);
          if (!shouldContinue) return;
        }
      }

      if (token === runToken) finishStory();
    }

    function restorePage() {
      document.body.classList.remove("case-intro-open");
      if (backdropRoot) backdropRoot.inert = backdropWasInert;
    }

    function close() {
      if (root.hidden) return;
      cancelPlayback();
      root.hidden = true;
      root.classList.remove("is-thinking");
      restorePage();
      const target = returnFocus;
      activeStory = null;
      activeRoute = "";
      returnFocus = null;
      if (target && document.contains(target)) target.focus({ preventScroll: true });
      if (typeof settings.onClose === "function") settings.onClose();
    }

    function open(config) {
      const caseId = String(config?.caseId || "");
      const route = String(config?.route || "");
      const story = stories.get(caseId);

      if (!story || !route || hasSeen(caseId)) {
        if (route) navigate(route);
        return false;
      }

      cancelPlayback();
      activeStory = story;
      activeRoute = route;
      returnFocus = config.returnFocus || document.activeElement;
      root.dataset.caseId = story.id;
      root.dataset.avatar = story.avatar;
      caseNumber.textContent = story.caseNumber;
      title.textContent = story.title;
      dialog.replaceChildren();
      live.textContent = "";
      startButton.disabled = true;
      startButton.textContent = "档案解密中…";
      skipButton.hidden = false;
      setPose(story.dialog[0]?.pose);

      backdropWasInert = Boolean(backdropRoot?.inert);
      if (backdropRoot) backdropRoot.inert = true;
      document.body.classList.add("case-intro-open");
      root.hidden = false;
      returnButton.focus({ preventScroll: true });
      if (typeof settings.onOpen === "function") settings.onOpen(story);

      if (reduceMotion.matches) renderFullStory();
      else playStory();
      return true;
    }

    function isOpen() {
      return !root.hidden;
    }

    function getFocusableElements() {
      return Array.from(root.querySelectorAll("button:not([disabled]):not([hidden])"));
    }

    returnButton.addEventListener("click", close);
    skipButton.addEventListener("click", renderFullStory);
    startButton.addEventListener("click", () => {
      if (!activeStory || !activeRoute || startButton.disabled) return;
      markSeen(activeStory.id);
      navigate(activeRoute);
    });

    root.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = getFocusableElements();
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    return Object.freeze({ open, close, isOpen, hasSeen });
  }

  global.CaseIntro = Object.freeze({ create });
})(window);
