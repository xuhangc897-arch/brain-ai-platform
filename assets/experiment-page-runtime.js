(function (global) {
  "use strict";

  const platform = global.BrainPlatform;
  const registry = global.BrainExperimentRegistry;

  function clone(value) {
    return structuredClone(value);
  }

  function getIdentityFields() {
    if (typeof global.getStudentIdentityFields === "function") {
      return global.getStudentIdentityFields();
    }
    return platform.identity.getStudentIdentityFields();
  }

  function create(moduleId) {
    const experiment = registry.get(moduleId);
    if (!experiment || experiment.kind !== "experiment") {
      throw new Error(`未知实验页面模块：${moduleId}`);
    }

    const storageKey = experiment.storageKey;
    const contextKey = platform.config.storageKeys.inquiryContext;

    function loadRecoveredState(options) {
      let saved = null;
      try {
        saved = JSON.parse(global.localStorage.getItem(storageKey) || "null");
      } catch (error) {
        global.localStorage.removeItem(storageKey);
      }

      const merged = options.mergeState(options.defaultState, saved || {});
      try {
        const context = JSON.parse(global.localStorage.getItem(contextKey) || "null");
        if (context && typeof options.applyContext === "function") {
          options.applyContext(merged, context);
        }
      } catch (error) {
        global.localStorage.removeItem(contextKey);
      }

      Object.assign(merged, getIdentityFields());
      return merged;
    }

    function loadFallbackState(options) {
      try {
        const saved = JSON.parse(global.localStorage.getItem(storageKey) || "null");
        const merged = options.mergeState(options.defaultState, saved || {});
        const context = JSON.parse(global.localStorage.getItem(contextKey) || "null");
        if (context && typeof options.applyContext === "function") {
          options.applyContext(merged, context);
        }
        Object.assign(merged, getIdentityFields());
        return merged;
      } catch (error) {
        return clone(options.defaultState);
      }
    }

    function loadState(options) {
      if (!options || typeof options.mergeState !== "function") {
        throw new Error("实验页面状态合并函数缺失。");
      }
      return options.errorMode === "fallback"
        ? loadFallbackState(options)
        : loadRecoveredState(options);
    }

    function saveState(state, options) {
      const settings = options || {};
      if (typeof settings.beforeSave === "function") {
        settings.beforeSave();
      }
      Object.assign(state, getIdentityFields());
      state.savedAt = new Date().toISOString();
      global.localStorage.setItem(storageKey, JSON.stringify(state));
      return state;
    }

    return Object.freeze({
      moduleId: experiment.id,
      storageKey,
      contextKey,
      loadState,
      saveState
    });
  }

  global.BrainExperimentPageRuntime = Object.freeze({
    create
  });
})(window);
