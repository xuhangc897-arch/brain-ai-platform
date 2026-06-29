(function () {
  "use strict";

  const DEFAULT_ENDPOINT = "";
  const READY_TIMEOUT_MS = 10000;
  const END_WAIT_TIMEOUT_MS = 5000;

  function getSignEndpoint() {
    return window.BRAIN_ASR_SIGN_ENDPOINT || DEFAULT_ENDPOINT;
  }

  function normalizeText(text) {
    return String(text || "").replace(/\s+/g, "");
  }

  function isSuccessCode(code) {
    return code === undefined || code === null || Number(code) === 0;
  }

  function pickResultText(result) {
    if (!result) return "";
    return result.voice_text_str || result.voice_text || result.text || "";
  }

  function extractResult(payload) {
    const result = payload && payload.result ? payload.result : null;
    const text = pickResultText(result);
    const sliceType = Number(result && result.slice_type);
    const isFinalSlice = sliceType === 2;
    const isRecognitionFinal = Number(payload && payload.final) === 1;

    return {
      text: String(text || ""),
      isFinalSlice,
      isRecognitionFinal
    };
  }

  function createClient(options) {
    const config = options || {};
    let socket = null;
    let state = "idle";
    let finalTexts = [];
    let closedByClient = false;
    let endTimer = null;

    function emitState(nextState) {
      state = nextState;
      if (typeof config.onStateChange === "function") {
        config.onStateChange(nextState);
      }
    }

    function emitError(message, error) {
      if (typeof config.onError === "function") {
        config.onError(message, error);
      }
    }

    function emitPartial(text) {
      if (typeof config.onPartial === "function") {
        config.onPartial(text);
      }
    }

    function emitFinal(text) {
      const normalized = normalizeText(text);
      if (!normalized) return;
      const alreadyExists = finalTexts.some((item) => normalizeText(item) === normalized);
      if (alreadyExists) return;
      finalTexts.push(text);
      if (typeof config.onFinal === "function") {
        config.onFinal(text);
      }
    }

    function clearEndTimer() {
      if (!endTimer) return;
      window.clearTimeout(endTimer);
      endTimer = null;
    }

    async function fetchWsUrl() {
      const endpoint = getSignEndpoint();
      if (!endpoint) {
        throw new Error("语音识别签名接口未配置，请设置 window.BRAIN_ASR_SIGN_ENDPOINT。");
      }

      const response = await fetch(endpoint, { method: "GET" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || `签名接口返回 HTTP ${response.status}`);
      }
      if (!data.wsUrl || typeof data.wsUrl !== "string") {
        throw new Error("签名接口没有返回 wsUrl。");
      }
      return data.wsUrl;
    }

    function closeSocket() {
      clearEndTimer();
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close();
      } else if (socket) {
        socket.close();
      }
      socket = null;
    }

    function handleMessage(event) {
      let payload = null;
      try {
        payload = JSON.parse(event.data);
      } catch (error) {
        return;
      }

      if (!isSuccessCode(payload.code)) {
        emitError(payload.message || "语音识别服务返回错误。", payload);
        return;
      }

      const result = extractResult(payload);
      if (result.text) {
        if (result.isFinalSlice || result.isRecognitionFinal) {
          emitFinal(result.text);
          emitPartial("");
        } else {
          emitPartial(result.text);
        }
      }

      if (result.isRecognitionFinal) {
        closedByClient = true;
        closeSocket();
        emitState("idle");
      }
    }

    function openSocket(wsUrl) {
      return new Promise((resolve, reject) => {
        const nextSocket = new WebSocket(wsUrl);
        let settled = false;
        const readyTimer = window.setTimeout(() => {
          if (settled) return;
          settled = true;
          nextSocket.close();
          reject(new Error("WebSocket 连接超时。"));
        }, READY_TIMEOUT_MS);

        nextSocket.binaryType = "arraybuffer";
        nextSocket.addEventListener("open", () => {
          if (settled) return;
          settled = true;
          window.clearTimeout(readyTimer);
          socket = nextSocket;
          resolve();
        });
        nextSocket.addEventListener("message", handleMessage);
        nextSocket.addEventListener("error", (event) => {
          if (closedByClient) {
            return;
          }
          if (!settled) {
            settled = true;
            window.clearTimeout(readyTimer);
            reject(new Error("WebSocket 连接失败。"));
            return;
          }
          emitError("WebSocket 连接失败。", event);
        });
        nextSocket.addEventListener("close", () => {
          clearEndTimer();
          socket = null;
          if (closedByClient) {
            if (!settled) {
              settled = true;
              window.clearTimeout(readyTimer);
            }
            emitState("idle");
            return;
          }
          if (!settled) {
            settled = true;
            window.clearTimeout(readyTimer);
            reject(new Error("WebSocket 已关闭。"));
            return;
          }
          emitState("closed");
          emitError("WebSocket 连接失败。");
        });
      });
    }

    async function connect() {
      if (state === "connecting" || state === "open" || state === "ending") return;
      closedByClient = false;
      emitState("connecting");
      try {
        const wsUrl = await fetchWsUrl();
        await openSocket(wsUrl);
        emitState("open");
      } catch (error) {
        emitState("idle");
        throw error;
      }
    }

    function sendAudio(buffer) {
      if (!socket || socket.readyState !== WebSocket.OPEN || state !== "open") return false;
      socket.send(buffer);
      return true;
    }

    function stop() {
      closedByClient = true;
      emitPartial("");
      if (!socket) {
        emitState("idle");
        return;
      }

      if (socket.readyState === WebSocket.OPEN) {
        emitState("ending");
        try {
          socket.send(JSON.stringify({ type: "end" }));
        } catch (error) {
          emitError("发送结束识别消息失败。", error);
          closeSocket();
          emitState("idle");
          return;
        }
        clearEndTimer();
        endTimer = window.setTimeout(() => {
          closeSocket();
          emitState("idle");
        }, END_WAIT_TIMEOUT_MS);
        return;
      }

      closeSocket();
      emitState("idle");
    }

    function reset() {
      finalTexts = [];
      emitPartial("");
    }

    return {
      connect,
      sendAudio,
      stop,
      reset,
      getState() {
        return state;
      }
    };
  }

  window.AsrClient = {
    create: createClient
  };
})();
