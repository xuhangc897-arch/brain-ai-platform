(function () {
  "use strict";

  const TARGET_SAMPLE_RATE = 16000;
  const CHUNK_DURATION_MS = 40;
  const PROCESSOR_BUFFER_SIZE = 4096;

  function formatTime(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function floatTo16BitPcm(floatSamples) {
    const buffer = new ArrayBuffer(floatSamples.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < floatSamples.length; i += 1) {
      const sample = Math.max(-1, Math.min(1, floatSamples[i]));
      view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    }
    return buffer;
  }

  function downsampleBuffer(input, sourceRate, targetRate) {
    if (targetRate === sourceRate) return input;
    if (targetRate > sourceRate) {
      throw new Error("Target sample rate must be lower than source sample rate.");
    }

    const ratio = sourceRate / targetRate;
    const outputLength = Math.floor(input.length / ratio);
    const output = new Float32Array(outputLength);
    let inputOffset = 0;

    for (let outputOffset = 0; outputOffset < outputLength; outputOffset += 1) {
      const nextInputOffset = Math.floor((outputOffset + 1) * ratio);
      let sum = 0;
      let count = 0;
      for (let i = inputOffset; i < nextInputOffset && i < input.length; i += 1) {
        sum += input[i];
        count += 1;
      }
      output[outputOffset] = count ? sum / count : 0;
      inputOffset = nextInputOffset;
    }

    return output;
  }

  function createRecorder(options) {
    const config = options || {};
    let stream = null;
    let audioContext = null;
    let source = null;
    let processor = null;
    let state = "idle";
    let timerId = null;
    let startedAt = 0;
    let pcmQueue = [];
    let queuedSamples = 0;
    let audioDataHandler = null;

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

    function emitTime(seconds) {
      if (typeof config.onTimeChange === "function") {
        config.onTimeChange({ seconds, label: formatTime(seconds) });
      }
    }

    function stopTimer() {
      if (timerId) {
        window.clearInterval(timerId);
        timerId = null;
      }
    }

    function startTimer() {
      startedAt = Date.now();
      emitTime(0);
      stopTimer();
      timerId = window.setInterval(() => {
        emitTime(Math.floor((Date.now() - startedAt) / 1000));
      }, 250);
    }

    function releaseAudioGraph() {
      if (processor) {
        processor.onaudioprocess = null;
        processor.disconnect();
        processor = null;
      }
      if (source) {
        source.disconnect();
        source = null;
      }
      if (audioContext) {
        audioContext.close().catch(() => {});
        audioContext = null;
      }
    }

    function releaseStream() {
      if (!stream) return;
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }

    function resetAudioQueue() {
      pcmQueue = [];
      queuedSamples = 0;
    }

    function flushChunks(force) {
      const samplesPerChunk = Math.floor((TARGET_SAMPLE_RATE * CHUNK_DURATION_MS) / 1000);
      while (queuedSamples >= samplesPerChunk || (force && queuedSamples > 0)) {
        const nextLength = force && queuedSamples < samplesPerChunk ? queuedSamples : samplesPerChunk;
        const chunk = new Float32Array(nextLength);
        let offset = 0;

        while (offset < nextLength && pcmQueue.length) {
          const head = pcmQueue[0];
          const take = Math.min(head.length, nextLength - offset);
          chunk.set(head.subarray(0, take), offset);
          offset += take;

          if (take === head.length) {
            pcmQueue.shift();
          } else {
            pcmQueue[0] = head.subarray(take);
          }
        }

        queuedSamples -= nextLength;
        if (audioDataHandler) {
          audioDataHandler(floatTo16BitPcm(chunk));
        }
      }
    }

    function handleAudioProcess(event) {
      if (state !== "recording") return;
      const input = event.inputBuffer.getChannelData(0);
      const downsampled = downsampleBuffer(input, audioContext.sampleRate, TARGET_SAMPLE_RATE);
      pcmQueue.push(downsampled);
      queuedSamples += downsampled.length;
      flushChunks(false);
    }

    function isSupported() {
      return Boolean(
        navigator.mediaDevices &&
        navigator.mediaDevices.getUserMedia &&
        (window.AudioContext || window.webkitAudioContext)
      );
    }

    async function prepare() {
      if (state === "recording" || state === "ready") return;
      if (!isSupported()) {
        throw new Error("当前浏览器不支持语音录音，请使用最新版 Edge 或 Chrome。");
      }

      emitState("requesting");
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
        stream.getAudioTracks().forEach((track) => {
          track.addEventListener("ended", () => {
            if (state === "recording" || state === "ready") stop();
          }, { once: true });
        });
        emitState("ready");
      } catch (error) {
        releaseStream();
        emitState("idle");
        throw new Error("未获得麦克风权限，请在浏览器设置中允许访问麦克风后重试。");
      }
    }

    function start(onAudioData) {
      if (state === "recording") return;
      if (!stream) {
        throw new Error("麦克风尚未准备好。");
      }

      const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
      audioContext = new AudioContextConstructor();
      source = audioContext.createMediaStreamSource(stream);
      processor = audioContext.createScriptProcessor(PROCESSOR_BUFFER_SIZE, 1, 1);
      audioDataHandler = onAudioData;
      resetAudioQueue();
      processor.onaudioprocess = handleAudioProcess;
      source.connect(processor);
      processor.connect(audioContext.destination);
      emitState("recording");
      startTimer();
    }

    function stop() {
      if (state === "idle") return;
      flushChunks(true);
      releaseAudioGraph();
      releaseStream();
      resetAudioQueue();
      stopTimer();
      emitTime(0);
      audioDataHandler = null;
      emitState("idle");
    }

    return {
      prepare,
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
