(function (global) {
  "use strict";

  const SDK_URL = "https://static.cloudbase.net/cloudbase-js-sdk/3.0.0/cloudbase.full.js";
  let pending = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const timer = global.setTimeout(() => {
        script.remove();
        reject(new Error("教师登录服务加载超时，请重试。"));
      }, 12000);
      script.src = src;
      script.onload = () => { global.clearTimeout(timer); resolve(); };
      script.onerror = () => {
        global.clearTimeout(timer);
        script.remove();
        reject(new Error("教师登录服务加载失败，请重试。"));
      };
      document.head.appendChild(script);
    });
  }

  function load() {
    if (global.BrainCloudBase) return Promise.resolve(global.BrainCloudBase);
    if (!pending) {
      pending = (async () => {
        if (!global.cloudbase) await loadScript(SDK_URL);
        await loadScript("cloudbase.js");
        if (!global.BrainCloudBase) throw new Error("教师登录服务暂时不可用，请重试。");
        return global.BrainCloudBase;
      })().catch((error) => {
        pending = null;
        throw error;
      });
    }
    return pending;
  }

  global.BrainCloudBaseLoader = Object.freeze({ load });
})(window);
