(function (global) {
  "use strict";

  async function request(action, experimentId, submissionId) {
    const platform = global.BrainPlatform;
    const session = platform?.identity.readStudentSession() || {};
    if (!session.sessionToken || session.isGuest) return { ok: false, code: "UNAUTHORIZED" };
    try {
      const response = await global.fetch(platform.config.endpoints.experimentReportArchive, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.sessionToken}` },
        body: JSON.stringify({ action, experimentId, submissionId })
      });
      const result = await response.json().catch(() => ({}));
      return Object.assign({ ok: response.ok && Boolean(result.ok) }, result);
    } catch (error) {
      return { ok: false, code: "NETWORK_ERROR" };
    }
  }

  global.BrainReportArchiveClient = Object.freeze({
    list: () => request("list"),
    generate: (experimentId, submissionId) => request("generate", experimentId, submissionId)
  });
})(window);
