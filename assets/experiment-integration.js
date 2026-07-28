(function (global) {
  "use strict";

  const registry = global.BrainExperimentRegistry;
  const routeEntries = registry.entries.filter((entry) => entry.route);

  function getModule(moduleId) {
    return registry.get(moduleId);
  }

  function getModuleLabel(moduleId) {
    const entry = getModule(moduleId);
    return entry ? entry.label : String(moduleId || "");
  }

  function getModuleFromPath(pathname) {
    const normalizedPath = String(pathname || "")
      .split(/[?#]/, 1)[0]
      .replace(/\\/g, "/");
    const pageName = normalizedPath.slice(normalizedPath.lastIndexOf("/") + 1);
    return routeEntries.find((entry) => entry.route === pageName) || null;
  }

  function resolveSourceModule(moduleId, pathname) {
    const requested = getModule(moduleId);
    if (requested && requested.kind !== "service") {
      return requested.id;
    }
    const current = getModuleFromPath(pathname);
    return current && current.kind !== "service" ? current.id : "";
  }

  function resolveReportActivity(moduleId, fallbackModuleId) {
    const requested = getModule(moduleId);
    if (requested && requested.reportEnabled) {
      return requested;
    }
    const fallback = getModule(fallbackModuleId || "memory");
    return fallback && fallback.reportEnabled ? fallback : null;
  }

  function getRecordPayload(record) {
    const payload = record && record.data;
    return payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload
      : {};
  }

  function getRecordState(record) {
    const payload = getRecordPayload(record);
    const fullState = payload.fullState;
    return fullState && typeof fullState === "object" && !Array.isArray(fullState)
      ? fullState
      : payload;
  }

  function createModuleDispatcher(handlers, fallbackHandler) {
    const moduleHandlers = Object.assign({}, handlers);
    return Object.freeze({
      has(moduleId) {
        return typeof moduleHandlers[moduleId] === "function";
      },
      dispatch(moduleId, ...args) {
        const handler = moduleHandlers[moduleId];
        if (typeof handler === "function") {
          return handler(...args);
        }
        if (typeof fallbackHandler === "function") {
          return fallbackHandler(...args);
        }
        return undefined;
      }
    });
  }

  global.BrainExperimentIntegration = Object.freeze({
    getModule,
    getModuleLabel,
    getModuleFromPath,
    resolveSourceModule,
    resolveReportActivity,
    getRecordPayload,
    getRecordState,
    createModuleDispatcher
  });
})(window);
