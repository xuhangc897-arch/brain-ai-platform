(function (global) {
  "use strict";

  const IDENTITY_SCHEMA_VERSION = 1;
  const RECORD_SCHEMA_VERSION = 2;
  const ENV_ID = "memory-detective-platfor-d369a42";
  const HTTP_BASE = `https://${ENV_ID}-1441391469.ap-shanghai.app.tcloudbase.com`;
  const experimentRegistry = global.BrainExperimentRegistry;

  if (!experimentRegistry) {
    throw new Error("实验注册表未加载。");
  }

  const experimentStorageKeys = Object.freeze(Object.fromEntries(
    experimentRegistry.experiments.map((entry) => [entry.id, entry.storageKey])
  ));

  const config = Object.freeze({
    envId: ENV_ID,
    endpoints: Object.freeze({
      studentLogin: `${HTTP_BASE}/studentLogin`,
      createStudents: `${HTTP_BASE}/createStudents`,
      saveExperimentRecord: `${HTTP_BASE}/saveExperimentRecord`,
      saveExperimentSubmission: `${HTTP_BASE}/saveExperimentSubmission`,
      getLatestExperimentSubmission: `${HTTP_BASE}/getLatestExperimentSubmission`,
      saveLearningRecord: `${HTTP_BASE}/saveLearningRecord`,
      saveAgentIntervention: `${HTTP_BASE}/saveAgentIntervention`,
      checkTaskRelevance: `${HTTP_BASE}/checkTaskRelevance`,
      generateExperimentMemory: `${HTTP_BASE}/generateExperimentMemory`,
      getStudentMemory: `${HTTP_BASE}/getStudentMemory`,
      generateLearningDiagnosis: `${HTTP_BASE}/generateLearningDiagnosis`,
      getLearningDiagnosis: `${HTTP_BASE}/getLearningDiagnosis`,
      getExperimentRecords: `${HTTP_BASE}/getExperimentRecords`,
      saveAiChatRecord: `${HTTP_BASE}/saveAiChatRecord`,
      aiChat: "https://1441391469-6rhud8ln4o.ap-shanghai.tencentscf.com"
    }),
    storageKeys: Object.freeze({
      studentSession: "studentSession",
      uploadOutbox: "experiment-upload-outbox-v1",
      submissionOutbox: "experiment-submission-outbox-v1",
      aiChatOutbox: "ai-chat-outbox-v1",
      learningBehaviorOutbox: "learning-behavior-outbox-v1",
      agentInterventionOutbox: "agent-intervention-outbox-v1",
      typingSupportState: "typing-support-state-v1",
      taskRelevanceState: "task-relevance-state-v1",
      taskRelevanceOutbox: "task-relevance-outbox-v1",
      studentMemoryOutbox: "student-memory-generation-outbox-v1",
      studentMemorySupportState: "student-memory-support-state-v1",
      learningDiagnosisOutbox: "learning-diagnosis-outbox-v1",
      inquiryContext: "science-inquiry-context-v1",
      aiChatLogs: experimentRegistry.get("aiChat").storageKey,
      pretest: experimentRegistry.get("screening").storageKey,
      qualification: "detectiveQualificationData",
      experiments: experimentStorageKeys
    })
  });

  const contracts = Object.freeze({
    identitySchemaVersion: IDENTITY_SCHEMA_VERSION,
    recordSchemaVersion: RECORD_SCHEMA_VERSION,
    roles: Object.freeze({
      student: "student",
      guest: "guest",
      teacher: "teacher"
    }),
    modules: experimentRegistry.moduleIds,
    recordTypes: Object.freeze(["experiment", "state", "submission"])
  });

  function normalizeText(value) {
    return String(value == null ? "" : value).trim();
  }

  function normalizeStudentSession(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;

    const session = Object.assign({}, value);
    const isGuest = Boolean(value.isGuest);

    session.schemaVersion = Number(value.schemaVersion) || IDENTITY_SCHEMA_VERSION;
    session.role = isGuest ? contracts.roles.guest : contracts.roles.student;
    session.isGuest = isGuest;
    session.studentId = normalizeText(value.studentId);
    session.name = normalizeText(value.name || value.studentName);
    session.class = normalizeText(value.class || value.className);
    session.group = normalizeText(value.group || value.groupName || value.groupId);

    if ("uid" in value) session.uid = normalizeText(value.uid);
    if ("sessionToken" in value) session.sessionToken = normalizeText(value.sessionToken);
    if ("sessionExpiresAt" in value) session.sessionExpiresAt = normalizeText(value.sessionExpiresAt);
    if ("mustChangePassword" in value) {
      session.mustChangePassword = Boolean(value.mustChangePassword);
    }

    return session;
  }

  function readStudentSession() {
    try {
      const value = JSON.parse(global.localStorage.getItem(config.storageKeys.studentSession) || "null");
      const session = normalizeStudentSession(value);
      if (
        session &&
        !session.isGuest &&
        session.sessionExpiresAt &&
        Date.parse(session.sessionExpiresAt) <= Date.now()
      ) {
        global.localStorage.removeItem(config.storageKeys.studentSession);
        return null;
      }
      return session;
    } catch (error) {
      global.localStorage.removeItem(config.storageKeys.studentSession);
      return null;
    }
  }

  function writeStudentSession(value) {
    const session = normalizeStudentSession(value);
    if (!session) {
      throw new Error("学生会话格式无效。");
    }

    global.localStorage.setItem(config.storageKeys.studentSession, JSON.stringify(session));
    return session;
  }

  function clearStudentSession() {
    global.localStorage.removeItem(config.storageKeys.studentSession);
  }

  function getStorageOwner(value) {
    const session = value === undefined ? readStudentSession() : normalizeStudentSession(value);
    if (!session) return "anonymous";
    if (session.isGuest) return "guest";
    return session.studentId ? `student:${session.studentId}` : "anonymous";
  }

  function scopedStorageKey(baseKey, value) {
    const key = normalizeText(baseKey);
    if (!key) throw new Error("Storage key is required.");
    return `${key}::${encodeURIComponent(getStorageOwner(value))}`;
  }

  function migrateScopedJson(baseKey, value) {
    const scopedKey = scopedStorageKey(baseKey, value);
    if (global.localStorage.getItem(scopedKey) != null) return scopedKey;
    const session = value === undefined ? readStudentSession() : normalizeStudentSession(value);
    if (!session) return scopedKey;
    try {
      const legacy = JSON.parse(global.localStorage.getItem(baseKey) || "null");
      const legacyStudentId = normalizeText(legacy && legacy.studentId);
      const currentStudentId = session.isGuest ? "guest" : session.studentId;
      if (legacy && legacyStudentId && legacyStudentId === currentStudentId) {
        global.localStorage.setItem(scopedKey, JSON.stringify(legacy));
      }
    } catch (error) {
      // Invalid legacy data is ignored instead of assigning it to another account.
    }
    return scopedKey;
  }

  function isGuestSession(value) {
    const session = value === undefined ? readStudentSession() : normalizeStudentSession(value);
    return Boolean(session && session.isGuest);
  }

  function getStudentIdentityFields(value) {
    const session = value === undefined ? (readStudentSession() || {}) : (normalizeStudentSession(value) || {});

    if (session.isGuest) {
      return {
        studentId: "guest",
        studentName: "游客",
        className: "游客模式",
        groupName: "本地体验",
        isGuest: true,
        createdAt: new Date().toLocaleString()
      };
    }

    return {
      studentId: session.studentId || "",
      studentName: session.name || "",
      className: session.class || "",
      groupName: session.group || "",
      createdAt: new Date().toLocaleString()
    };
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
    const sourceRecord = record && typeof record === "object" ? record : {};
    const session = normalizeStudentSession(student) || {};
    const studentId = normalizeText(sourceRecord.studentId || session.studentId);
    const nextRecord = Object.assign({}, sourceRecord, {
      studentId,
      studentName: normalizeText(sourceRecord.studentName || session.name),
      className: normalizeText(sourceRecord.className || session.class),
      groupName: normalizeText(sourceRecord.groupName || sourceRecord.groupId || session.group),
      createdAt: sourceRecord.createdAt || new Date().toLocaleString()
    });

    nextRecord.clientRecordId = buildClientRecordId(module, recordType, studentId, nextRecord);
    nextRecord.schemaVersion = RECORD_SCHEMA_VERSION;
    return nextRecord;
  }

  function buildExperimentRecordPayload(options, student) {
    const module = normalizeText(options && options.module);
    const recordType = normalizeText((options && options.recordType) || "experiment");
    const records = Array.isArray(options && options.records) ? options.records : [];

    return {
      schemaVersion: RECORD_SCHEMA_VERSION,
      module,
      recordType,
      records: records.map((record) => attachIdentity(module, recordType, record, student))
    };
  }

  global.BrainPlatform = Object.freeze({
    config,
    contracts,
    identity: Object.freeze({
      normalizeStudentSession,
      readStudentSession,
      writeStudentSession,
      clearStudentSession,
      isGuestSession,
      getStudentIdentityFields
    }),
    storage: Object.freeze({
      getOwner: getStorageOwner,
      scopedKey: scopedStorageKey,
      migrateScopedJson
    }),
    records: Object.freeze({
      buildClientRecordId,
      attachIdentity,
      buildExperimentRecordPayload
    })
  });
})(window);
