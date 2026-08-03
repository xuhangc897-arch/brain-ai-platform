(function (global) {
  "use strict";

  const registry = global.BrainExperimentRegistry;

  function requireModule(moduleId) {
    const entry = registry && registry.get(moduleId);
    if (!entry) {
      throw new Error(`未知实验模块：${moduleId}`);
    }
    return entry;
  }

  function submitState(options) {
    if (typeof global.uploadExperimentRecords !== "function") return;

    const moduleId = String(options && options.moduleId || "");
    requireModule(moduleId);

    if (typeof options.beforeSnapshot === "function") {
      options.beforeSnapshot();
    }

    const snapshot = options.snapshot === undefined
      ? structuredClone(options.state)
      : options.snapshot;
    const submitAction = String(options.submitAction || "");
    const submittedAt = options.submittedAt || new Date().toISOString();

    return global.uploadExperimentRecords({
      module: moduleId,
      recordType: "submission",
      records: [{
        submitAction,
        studentId: snapshot.studentId || "",
        studentName: snapshot.studentName || "",
        className: snapshot.className || "",
        groupName: snapshot.groupName || snapshot.groupId || "",
        fullState: snapshot,
        createdAt: submittedAt,
        clientRecordId: `${moduleId}|submission|${snapshot.studentId || ""}|${submitAction}|${submittedAt}`
      }]
    });
  }

  function finishReport(moduleId, submitAction) {
    const entry = requireModule(moduleId);
    const reportUrl = registry.getReportUrl(entry.id);
    if (!reportUrl) {
      throw new Error(`模块不支持生成报告：${moduleId}`);
    }

    const submissionId = String(submitAction || "");
    const separator = reportUrl.includes("?") ? "&" : "?";
    const target = submissionId
      ? `${reportUrl}${separator}submissionId=${encodeURIComponent(submissionId)}`
      : reportUrl;
    return global.open(target, "_blank");
  }

  function submitExperimentState(options) {
    const moduleId = String(options && options.moduleId || "");
    requireModule(moduleId);
    if (typeof options.beforeSnapshot === "function") options.beforeSnapshot();
    if (!global.BrainExperimentSubmission) {
      return Promise.resolve({ ok: false, code: "SUBMISSION_CLIENT_UNAVAILABLE", queued: false });
    }
    return global.BrainExperimentSubmission.submit({
      experimentId: moduleId,
      state: options.state,
      submissionId: options.submissionId,
      submissionTime: options.submissionTime
    });
  }

  global.BrainExperimentBridge = Object.freeze({
    submitState,
    submitExperimentState,
    finishReport
  });
})(window);
