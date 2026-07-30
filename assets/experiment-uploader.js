(function (global) {
  "use strict";

  const platform = global.BrainPlatform;
  const SAVE_EXPERIMENT_RECORD_URL = platform.config.endpoints.saveExperimentRecord;
  const OUTBOX_KEY = platform.config.storageKeys.uploadOutbox;
  const OUTBOX_SCHEMA_VERSION = 1;
  const MAX_OUTBOX_ENTRIES = 200;
  const OUTBOX_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const RETRY_BASE_MS = 2000;
  const RETRY_MAX_MS = 5 * 60 * 1000;

  let activeFlush = null;
  let retryTimer = null;

  function normalizeText(value) {
    return String(value == null ? "" : value).trim();
  }

  function readOutbox() {
    try {
      const parsed = JSON.parse(global.localStorage.getItem(OUTBOX_KEY) || "null");
      const entries = parsed && Array.isArray(parsed.entries) ? parsed.entries : [];
      const now = Date.now();
      const outbox = {
        schemaVersion: OUTBOX_SCHEMA_VERSION,
        entries: entries.filter((entry) => (
          entry &&
          typeof entry === "object" &&
          entry.queueId &&
          entry.record &&
          Number(entry.expiresAt) > now
        ))
      };
      if (outbox.entries.length !== entries.length) {
        writeOutbox(outbox);
      }
      return outbox;
    } catch (error) {
      global.localStorage.removeItem(OUTBOX_KEY);
      return {
        schemaVersion: OUTBOX_SCHEMA_VERSION,
        entries: []
      };
    }
  }

  function writeOutbox(outbox) {
    global.localStorage.setItem(OUTBOX_KEY, JSON.stringify({
      schemaVersion: OUTBOX_SCHEMA_VERSION,
      updatedAt: new Date().toISOString(),
      entries: outbox.entries
    }));
  }

  function getOwnerKey(student) {
    return normalizeText(student && student.studentId) || "unknown";
  }

  function getQueueId(ownerKey, record) {
    return `${ownerKey}|${normalizeText(record && record.clientRecordId)}`;
  }

  function enqueuePayload(payload, student) {
    const ownerKey = getOwnerKey(student);
    const outbox = readOutbox();
    const existingIds = new Set(outbox.entries.map((entry) => entry.queueId));
    const nextEntries = [];
    const now = Date.now();

    for (const record of payload.records) {
      const queueId = getQueueId(ownerKey, record);
      if (existingIds.has(queueId)) continue;

      existingIds.add(queueId);
      nextEntries.push({
        queueId,
        ownerKey,
        schemaVersion: payload.schemaVersion,
        module: payload.module,
        recordType: payload.recordType,
        record,
        createdAt: new Date(now).toISOString(),
        expiresAt: now + OUTBOX_TTL_MS,
        attempts: 0,
        nextAttemptAt: 0,
        lastErrorCode: ""
      });
    }

    if (outbox.entries.length + nextEntries.length > MAX_OUTBOX_ENTRIES) {
      return {
        ok: false,
        code: "UPLOAD_QUEUE_FULL",
        message: "待上传记录过多，请保持网络连接后重试。",
        queueIds: []
      };
    }

    try {
      outbox.entries.push(...nextEntries);
      writeOutbox(outbox);
      return {
        ok: true,
        queueIds: payload.records.map((record) => getQueueId(ownerKey, record))
      };
    } catch (error) {
      return {
        ok: false,
        code: "UPLOAD_QUEUE_STORAGE_FAILED",
        message: "无法在本地保存待上传记录。",
        queueIds: []
      };
    }
  }

  function getRetryDelay(attempts) {
    return Math.min(RETRY_MAX_MS, RETRY_BASE_MS * (2 ** Math.min(attempts, 8)));
  }

  function isRetryableFailure(response, result) {
    if (!response) return true;
    if (response.status === 408 || response.status === 429 || response.status >= 500) return true;
    return Boolean(result && result.retryable);
  }

  async function sendEntry(entry) {
    let response;
    let result = {};
    const session = platform.identity.readStudentSession() || {};

    if (!session.sessionToken || normalizeText(session.studentId) !== entry.ownerKey) {
      return {
        acknowledged: false,
        retryable: true,
        code: "UNAUTHORIZED",
        status: 0
      };
    }

    try {
      response = await global.fetch(SAVE_EXPERIMENT_RECORD_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.sessionToken}`
        },
        body: JSON.stringify({
          schemaVersion: entry.schemaVersion,
          module: entry.module,
          recordType: entry.recordType,
          records: [entry.record]
        })
      });
      result = await response.json().catch(() => ({}));
    } catch (error) {
      return {
        acknowledged: false,
        retryable: true,
        code: "NETWORK_ERROR",
        status: 0
      };
    }

    if (response.ok && result.ok) {
      const recordResult = Array.isArray(result.results)
        ? result.results.find((item) => item.clientRecordId === entry.record.clientRecordId)
        : null;

      if (recordResult && recordResult.status === "failed") {
        return {
          acknowledged: recordResult.retryable === false,
          retryable: recordResult.retryable !== false,
          code: recordResult.code || "RECORD_WRITE_FAILED",
          status: response.status,
          result,
          recordResult
        };
      }

      return {
        acknowledged: true,
        retryable: false,
        code: "",
        status: response.status,
        result,
        recordResult
      };
    }

    const retryable = isRetryableFailure(response, result) || (
      result.code === "UNSUPPORTED_SCHEMA_VERSION" &&
      entry.schemaVersion === platform.contracts.recordSchemaVersion
    );

    return {
      acknowledged: !retryable,
      retryable,
      code: result.code || `HTTP_${response.status}`,
      status: response.status,
      result
    };
  }

  function updateEntryAfterFailure(entry, code) {
    const attempts = Number(entry.attempts) + 1;
    return Object.assign({}, entry, {
      attempts,
      nextAttemptAt: Date.now() + getRetryDelay(attempts),
      lastErrorCode: code || "UPLOAD_FAILED"
    });
  }

  function notifyAcknowledged(entry, status) {
    if (typeof global.CustomEvent !== "function" || !global.document) return;
    global.document.dispatchEvent(new CustomEvent("experiment-records:acknowledged", {
      detail: {
        module: entry.module,
        recordType: entry.recordType,
        clientRecordId: entry.record.clientRecordId,
        status
      }
    }));
  }

  function scheduleRetry() {
    if (typeof global.setTimeout !== "function") return;
    if (retryTimer && typeof global.clearTimeout === "function") {
      global.clearTimeout(retryTimer);
      retryTimer = null;
    }

    const student = platform.identity.readStudentSession() || {};
    if (platform.identity.isGuestSession(student)) return;

    const ownerKey = getOwnerKey(student);
    const pending = readOutbox().entries
      .filter((entry) => entry.ownerKey === ownerKey)
      .sort((left, right) => Number(left.nextAttemptAt) - Number(right.nextAttemptAt));

    if (pending.length === 0) return;

    const delay = Math.max(0, Math.min(
      RETRY_MAX_MS,
      Number(pending[0].nextAttemptAt) - Date.now()
    ));

    retryTimer = global.setTimeout(() => {
      retryTimer = null;
      flushUploadOutbox().catch(() => {});
    }, delay);
  }

  async function runFlush(options) {
    const student = platform.identity.readStudentSession() || {};
    if (platform.identity.isGuestSession(student)) {
      return { ok: true, guest: true, inserted: 0, skipped: 0, failed: 0, queued: 0, results: [] };
    }
    if (!student.studentId || !student.sessionToken) {
      return {
        ok: false,
        code: "UNAUTHORIZED",
        inserted: 0,
        skipped: 0,
        failed: 0,
        queued: 0,
        results: []
      };
    }

    const ownerKey = getOwnerKey(student);
    const force = Boolean(options && options.force);
    const targetIds = new Set(Array.isArray(options && options.queueIds) ? options.queueIds : []);
    const outbox = readOutbox();
    const results = [];
    let inserted = 0;
    let skipped = 0;
    let failed = 0;
    let storageFailed = false;
    const now = Date.now();

    for (let index = 0; index < outbox.entries.length; index += 1) {
      const entry = outbox.entries[index];
      if (entry.ownerKey !== ownerKey) continue;
      if (targetIds.size > 0 && !targetIds.has(entry.queueId)) continue;
      if (!force && Number(entry.nextAttemptAt) > now) continue;

      const outcome = await sendEntry(entry);
      const recordResult = outcome.recordResult || null;

      if (outcome.acknowledged) {
        outbox.entries.splice(index, 1);
        index -= 1;

        const status = recordResult && recordResult.status
          ? recordResult.status
          : outcome.code
            ? "failed"
            : "stored";
        if (status === "duplicate" || status === "skipped") skipped += 1;
        else if (status === "failed") failed += 1;
        else inserted += 1;

        results.push({
          clientRecordId: entry.record.clientRecordId,
          status,
          code: outcome.code || (recordResult && recordResult.code) || ""
        });
        notifyAcknowledged(entry, status);
      } else {
        outbox.entries[index] = updateEntryAfterFailure(entry, outcome.code);
        failed += 1;
        results.push({
          clientRecordId: entry.record.clientRecordId,
          status: "queued",
          code: outcome.code
        });
      }

      try {
        writeOutbox(outbox);
      } catch (error) {
        storageFailed = true;
        failed += 1;
        break;
      }
    }

    const pendingCount = outbox.entries.filter((entry) => (
      entry.ownerKey === ownerKey &&
      (targetIds.size === 0 || targetIds.has(entry.queueId))
    )).length;
    const queued = storageFailed ? Math.max(1, pendingCount) : pendingCount;

    scheduleRetry();
    return {
      ok: failed === 0 && queued === 0,
      inserted,
      skipped,
      failed,
      queued,
      results
    };
  }

  function flushUploadOutbox(options) {
    if (activeFlush) {
      return activeFlush.then(() => flushUploadOutbox(options));
    }

    activeFlush = runFlush(options).finally(() => {
      activeFlush = null;
    });
    return activeFlush;
  }

  async function uploadExperimentRecords(options) {
    const module = normalizeText(options && options.module);
    const recordType = normalizeText((options && options.recordType) || "experiment");
    const records = Array.isArray(options && options.records) ? options.records : [];

    if (!module || records.length === 0) {
      return { ok: false, skipped: true, message: "没有可上传的实验记录" };
    }

    const student = platform.identity.readStudentSession() || {};
    if (platform.identity.isGuestSession(student)) {
      return {
        ok: true,
        skipped: true,
        guest: true,
        message: "游客模式下实验记录不会上传后台，请在本地生成或下载报告。"
      };
    }
    if (!student.studentId || !student.sessionToken) {
      return {
        ok: false,
        code: "UNAUTHORIZED",
        retryable: false,
        message: "请重新登录后再上传实验记录。"
      };
    }

    const payload = platform.records.buildExperimentRecordPayload({
      module,
      recordType,
      records
    }, student);
    const queued = enqueuePayload(payload, student);

    if (!queued.ok) {
      console.warn("experiment record queue failed:", {
        code: queued.code
      });
      return queued;
    }

    const result = await flushUploadOutbox({
      force: true,
      queueIds: queued.queueIds
    });

    if (!result.ok) {
      console.warn("experiment record upload deferred:", {
        failed: result.failed,
        queued: result.queued
      });
    }

    return result;
  }

  global.uploadExperimentRecords = uploadExperimentRecords;
  global.flushExperimentUploadOutbox = flushUploadOutbox;

  if (typeof global.addEventListener === "function") {
    global.addEventListener("online", () => {
      flushUploadOutbox({ force: true }).catch(() => {});
    });
  }

  if (typeof global.setTimeout === "function") {
    global.setTimeout(() => {
      flushUploadOutbox().catch(() => {});
    }, 0);
  }
})(window);
