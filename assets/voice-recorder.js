(function () {
  "use strict";

  const UNSUPPORTED_MESSAGE = "当前浏览器不支持语音录音，请使用最新版 Edge 或 Chrome。";
  const PERMISSION_MESSAGE = "未获得麦克风权限，请在浏览器设置中允许访问麦克风后重试。";

  function formatTime(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function createRecorder(options) {
    const config = options || {};
    let stream = null;
    let timerId = null;
    let startedAt = 0;
    let state = "idle";
    let requestId = 0;

    function emitState(nextState) {
      state = nextState;
      if (typeof config.onStateChange === "function") {
        config.onStateChange(state);
      }
    }

    function emitTime(seconds) {
      if (typeof config.onTimeChange === "function") {
        config.onTimeChange({
          seconds,
          label: formatTime(seconds)
        });
      }
    }

    function emitError(message, error) {
      if (typeof config.onError === "function") {
        config.onError(message, error);
      }
    }

    function stopTimer() {
      if (!timerId) return;
      window.clearInterval(timerId);
      timerId = null;
    }

    function startTimer() {
      startedAt = Date.now();
      emitTime(0);
      stopTimer();
      timerId = window.setInterval(() => {
        emitTime(Math.floor((Date.now() - startedAt) / 1000));
      }, 250);
    }

    function releaseStream() {
      if (!stream) return;
      stream.getTracks().forEach((track) => {
        track.stop();
      });
      stream = null;
    }

    function isSupported() {
      return Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    }

    async function start() {
      if (state === "recording") return;
      if (!isSupported()) {
        emitError(UNSUPPORTED_MESSAGE);
        return;
      }

      const currentRequestId = requestId + 1;
      requestId = currentRequestId;
      emitState("requesting");
      try {
        const nextStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (requestId !== currentRequestId || state !== "requesting") {
          nextStream.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = nextStream;
        console.log("Permission Granted");
        console.log("Recording Started");
        stream.getAudioTracks().forEach((track) => {
          track.addEventListener("ended", () => {
            if (state === "recording") {
              stop();
            }
          }, { once: true });
        });
        emitState("recording");
        startTimer();
      } catch (error) {
        console.log("Permission Denied");
        releaseStream();
        stopTimer();
        emitTime(0);
        emitState("idle");
        emitError(PERMISSION_MESSAGE, error);
      }
    }

    function stop() {
      if (state !== "recording" && state !== "requesting") return;
      requestId += 1;
      releaseStream();
      stopTimer();
      emitTime(0);
      emitState("idle");
      console.log("Recording Stopped");
    }

    return {
      start,
      stop,
      isSupported,
      getState() {
        return state;
      }
    };
  }

  window.VoiceRecorder = {
    create: createRecorder,
    formatTime
  };
})();
