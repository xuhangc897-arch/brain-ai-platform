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

  applyTheme(readTheme(), false);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindThemeControls, { once: true });
  } else {
    bindThemeControls();
  }

  window.MemoryDetectiveTheme = Object.freeze({
    get: () => document.documentElement.dataset.theme || DEFAULT_THEME,
    set: (theme) => applyTheme(theme, true)
  });
})();
