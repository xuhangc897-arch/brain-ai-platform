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

  function finishReport(moduleId, submitAction, reportTab) {
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
    if (reportTab && !reportTab.closed) {
      reportTab.location.href = target;
      reportTab.focus();
      return reportTab;
    }
    return global.open(target, "_blank");
  }

  function reportStatus(reportTab, title, message) {
    if (!reportTab || reportTab.closed) return;
    try {
      const doc = reportTab.document;
      doc.title = title;
      doc.body.replaceChildren();
      doc.body.style.cssText = "font:18px/1.7 system-ui,sans-serif;max-width:620px;margin:12vh auto;padding:0 24px;color:#243047";
      const heading = doc.createElement("h1");
      heading.textContent = title;
      const detail = doc.createElement("p");
      detail.textContent = message;
      doc.body.append(heading, detail);
    } catch (error) {
      // The student may have navigated the pending tab elsewhere.
    }
  }

  function waitForLearningRecords() {
    const flush = global.LearningBehaviorTracker?.flush();
    return new Promise((resolve) => {
      const timeout = global.setTimeout(resolve, 5000);
      Promise.resolve(flush).then(() => {
        global.clearTimeout(timeout);
        resolve();
      }, () => {
        global.clearTimeout(timeout);
        resolve();
      });
    });
  }

  function openPendingReport() {
    const reportTab = global.open("about:blank", "_blank");
    reportStatus(reportTab, "正在保存实验记录", "保存成功后会自动打开正式报告，请稍候。");
    return reportTab;
  }

  function showReportFailure(reportTab, result) {
    const message = result && result.queued
      ? "提交尚未确认，记录已保留。请返回实验页，检查网络后再次点击生成报告。"
      : "正式提交失败。请返回实验页重试。";
    reportStatus(reportTab, "报告暂未生成", message);
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
    finishReport,
    waitForLearningRecords,
    openPendingReport,
    showReportFailure
  });
})(window);
