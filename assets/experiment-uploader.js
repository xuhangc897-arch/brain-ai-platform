(function () {
  "use strict";

  const SAVE_EXPERIMENT_RECORD_URL = "https://memory-detective-platfor-d369a42-1441391469.ap-shanghai.app.tcloudbase.com/saveExperimentRecord";

  function readStudentSession() {
    try {
      return JSON.parse(localStorage.getItem("studentSession") || "null") || {};
    } catch (error) {
      return {};
    }
  }

  function normalizeText(value) {
    return String(value == null ? "" : value).trim();
  }

  function hashText(text) {
    let hash = 0;
    for (let index = 0; index < text.length; index += 1) {
      hash = ((hash << 5) - hash) + text.charCodeAt(index);
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }

  function buildClientRecordId(module, recordType, studentId, record) {
    if (record.clientRecordId) return record.clientRecordId;

    const stableParts = [
      module,
      recordType,
      studentId,
      record.runId,
      record.subject,
      record.runNumber,
      record.length,
      record.createdAt
    ].map(normalizeText);

    if (stableParts.some(Boolean)) {
      return stableParts.join("|");
    }

    return `${module}|${recordType}|${studentId}|${hashText(JSON.stringify(record))}`;
  }

  function attachIdentity(module, recordType, record, student) {
    const studentId = normalizeText(record.studentId || student.studentId);
    const nextRecord = Object.assign({}, record, {
      studentId,
      studentName: normalizeText(record.studentName || student.name),
      className: normalizeText(record.className || student.class),
      groupName: normalizeText(record.groupName || record.groupId || student.group),
      createdAt: record.createdAt || new Date().toLocaleString()
    });

    nextRecord.clientRecordId = buildClientRecordId(module, recordType, studentId, nextRecord);
    return nextRecord;
  }

  async function uploadExperimentRecords(options) {
    const module = normalizeText(options && options.module);
    const recordType = normalizeText((options && options.recordType) || "experiment");
    const records = Array.isArray(options && options.records) ? options.records : [];

    if (!module || records.length === 0) {
      return { ok: false, skipped: true, message: "没有可上传的实验记录" };
    }

    const student = readStudentSession();
    const payloadRecords = records.map((record) => attachIdentity(module, recordType, record, student));

    try {
      const response = await fetch(SAVE_EXPERIMENT_RECORD_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          module,
          recordType,
          records: payloadRecords
        })
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.ok) {
        console.warn("experiment record upload failed:", {
          status: response.status,
          result
        });
      } else {
        console.info("experiment record upload succeeded:", result);
      }

      return result;
    } catch (error) {
      console.warn("experiment record upload error:", error);
      return {
        ok: false,
        error: error && error.message ? error.message : String(error)
      };
    }
  }

  window.uploadExperimentRecords = uploadExperimentRecords;
})();
