(function () {
  "use strict";

  const STORAGE_KEY = "theme";
  const DEFAULT_THEME = "science";
  const THEMES = new Set(["science", "archive"]);

  function readTheme() {
    try {
      const savedTheme = localStorage.getItem(STORAGE_KEY);
      return THEMES.has(savedTheme) ? savedTheme : DEFAULT_THEME;
    } catch (error) {
      return DEFAULT_THEME;
    }
  }

  function updateControls(theme) {
    document.querySelectorAll("[data-theme-option]").forEach((button) => {
      const isActive = button.dataset.themeOption === theme;
      button.setAttribute("aria-pressed", String(isActive));
      button.tabIndex = isActive ? 0 : -1;
    });
  }

  function applyTheme(theme, persist) {
    const nextTheme = THEMES.has(theme) ? theme : DEFAULT_THEME;
    document.documentElement.dataset.theme = nextTheme;
    updateControls(nextTheme);

    if (persist) {
      try {
        localStorage.setItem(STORAGE_KEY, nextTheme);
      } catch (error) {
        // The visual theme still works when browser storage is unavailable.
      }
    }
  }

  function bindThemeControls() {
    document.querySelectorAll("[data-theme-option]").forEach((button) => {
      button.addEventListener("click", () => {
        applyTheme(button.dataset.themeOption, true);
      });
    });
    updateControls(document.documentElement.dataset.theme || DEFAULT_THEME);
  }

  function setupMobileExperimentChrome() {
    if (!document.body.classList.contains("experiment-page")) return;

    const topActions = document.querySelector(".top-actions");
    if (topActions && !topActions.querySelector(".mobile-actions-toggle")) {
      const toggle = document.createElement("button");
      toggle.className = "btn secondary mobile-actions-toggle";
      toggle.type = "button";
      toggle.textContent = "更多";
      toggle.setAttribute("aria-expanded", "false");
      toggle.addEventListener("click", () => {
        const open = topActions.classList.toggle("mobile-actions-open");
        toggle.textContent = open ? "收起" : "更多";
        toggle.setAttribute("aria-expanded", String(open));
      });
      topActions.appendChild(toggle);
    }

    const progress = document.querySelector(".progress");
    if (!progress || progress.previousElementSibling?.classList.contains("mobile-progress-current")) return;
    const current = document.createElement("p");
    current.className = "mobile-progress-current";
    current.setAttribute("aria-live", "polite");
    progress.before(current);

    const updateCurrentStep = () => {
      const active = progress.querySelector(".progress-step.is-active, .progress-step[aria-current='step']");
      if (!active) return;
      const number = active.querySelector("strong")?.textContent?.trim() || "";
      const label = active.querySelector("span")?.textContent?.trim() || active.textContent.trim();
      current.textContent = `当前步骤 ${number} · ${label}`;
    };

    updateCurrentStep();
    new MutationObserver(updateCurrentStep).observe(progress, {
      attributes: true,
      attributeFilter: ["class", "aria-current"],
      subtree: true
    });
  }

  applyTheme(readTheme(), false);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      bindThemeControls();
      setupMobileExperimentChrome();
    }, { once: true });
  } else {
    bindThemeControls();
    setupMobileExperimentChrome();
  }

  window.MemoryDetectiveTheme = Object.freeze({
    get: () => document.documentElement.dataset.theme || DEFAULT_THEME,
    set: (theme) => applyTheme(theme, true)
  });
})();
