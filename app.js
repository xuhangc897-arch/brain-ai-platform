"use strict";

const http = require("http");
const crypto = require("crypto");

const HOST = "asr.cloud.tencent.com";
const ASR_PATH_PREFIX = "/asr/v2";
const PORT = process.env.PORT || 9000;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function writeJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    ...CORS_HEADERS,
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload));
}

function getMissingEnv() {
  return ["APP_ID", "SECRET_ID", "SECRET_KEY"].filter((name) => !process.env[name]);
}

function createVoiceId() {
  return `${Date.now()}_${crypto.randomBytes(8).toString("hex")}`;
}

function createNonce() {
  return crypto.randomInt(100000, 999999999);
}

function createRequestParams() {
  const timestamp = Math.floor(Date.now() / 1000);

  return {
    secretid: String(process.env.SECRET_ID),
    timestamp,
    expired: timestamp + 3600,
    nonce: createNonce(),
    engine_model_type: "16k_zh",
    voice_id: createVoiceId(),
    voice_format: 1,
    needvad: 1,
    filter_dirty: 0,
    filter_modal: 0,
    filter_punc: 0,
    convert_num_mode: 1,
    word_info: 0
  };
}

function createSortedQueryString(params) {
  return Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
}

function createSignature(signText) {
  const signature = crypto
    .createHmac("sha1", String(process.env.SECRET_KEY))
    .update(signText)
    .digest("base64");

  if (signature.startsWith("\"") || signature.endsWith("\"")) {
    throw new Error("Invalid signature: unexpected quote wrapper");
  }

  return signature;
}

function createWsUrl() {
  const appid = String(process.env.APP_ID);
  const params = createRequestParams();
  const requestPath = `${ASR_PATH_PREFIX}/${appid}`;
  const sortedQueryString = createSortedQueryString(params);
  const signText = `${HOST}${requestPath}?${sortedQueryString}`;
  const signature = createSignature(signText);

  console.log("[ASR signText]", signText);
  console.log("[ASR signature]", signature);

  return {
    wsUrl: `wss://${HOST}${requestPath}?${sortedQueryString}&signature=${encodeURIComponent(signature)}`,
    debug: {
      signText,
      sortedQuery: sortedQueryString,
      voiceId: params.voice_id,
      timestamp: params.timestamp,
      expired: params.expired
    }
  };
}

function handleRequest(request, response) {
  if (request.method === "OPTIONS") {
    response.writeHead(204, CORS_HEADERS);
    response.end();
    return;
  }

  if (request.method !== "GET") {
    writeJson(response, 405, { error: "Method not allowed" });
    return;
  }

  const missing = getMissingEnv();
  if (missing.length) {
    console.error("[asr-sign] Missing environment variables:", missing.join(", "));
    writeJson(response, 500, { error: "Missing environment variables" });
    return;
  }

  try {
    const result = createWsUrl();
    console.info("[asr-sign] Created ASR WebSocket URL:", { voice_id: result.debug.voiceId });
    writeJson(response, 200, { wsUrl: result.wsUrl, debug: result.debug });
  } catch (error) {
    console.error("[asr-sign] Failed to create ASR WebSocket URL:", error && error.message);
    writeJson(response, 500, { error: "Failed to create ASR WebSocket URL" });
  }
}

http.createServer(handleRequest).listen(PORT, () => {
  console.info(`[asr-sign] Web function listening on port ${PORT}`);
});
