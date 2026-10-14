"use strict";

const crypto = require("crypto");
const cloudbase = require("@cloudbase/node-sdk");
const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const db = app.database();
const submissions = db.collection("experiment_submissions");
const legacyRecords = db.collection("experimentRecords");
const archives = db.collection("experiment_report_archives");
const EXPERIMENTS = ["memory", "nback", "interference", "strategies"];
const LABELS = ["实验一：记忆容量", "实验二：N-back 工作记忆", "实验三：长时记忆干扰", "实验四：长时记忆策略"];
const ID_PATTERN = /^[A-Za-z0-9_.:-]{1,100}$/;

function text(value) { return String(value == null ? "" : value).trim(); }
function body(event) {
  if (typeof event?.body === "string") { try { return JSON.parse(event.body); } catch (error) { return {}; } }
  return event?.body && typeof event.body === "object" ? event.body : event || {};
}
function header(event, name) {
  const headers = event?.headers || {};
  const key = Object.keys(headers).find((item) => item.toLowerCase() === name.toLowerCase());
  return key ? text(headers[key]) : "";
}
function session(event) {
  const secret = text(process.env.STUDENT_SESSION_SECRET);
  const parts = header(event, "authorization").replace(/^Bearer\s+/i, "").split(".");
  if (secret.length < 32 || parts.length !== 2) return null;
  const expected = crypto.createHmac("sha256", secret).update(parts[0]).digest("base64url");
  const left = Buffer.from(parts[1]); const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
  try {
    const value = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    const now = Math.floor(Date.now() / 1000);
    return value.version === 1 && ID_PATTERN.test(text(value.studentId)) && Number.isFinite(value.issuedAt)
      && Number.isFinite(value.expiresAt) && value.issuedAt <= now + 300 && value.expiresAt > now ? value : null;
  } catch (error) { return null; }
}
function archiveId(studentId, submissionId) {
  return `report_${crypto.createHash("sha256").update(`${studentId}|${submissionId}`).digest("hex")}`;
}
async function latestSubmission(studentId, experimentId, submissionId) {
  const condition = { studentId, experimentId };
  if (submissionId) condition.submissionId = submissionId;
  const result = await submissions.where(condition).orderBy("uploadedAt", "desc").limit(1).get();
  const found = Array.isArray(result.data) ? result.data[0] : null;
  if (found) return found;
  const legacy = await legacyRecords.where({ studentId, module: experimentId, recordType: "submission" })
    .orderBy("uploadedAt", "desc").limit(1).get();
  const record = Array.isArray(legacy.data) ? legacy.data[0] : null;
  if (!record) return null;
  const data = record.payload || record.data || {};
  const state = data.fullState || data;
  const id = text(data.clientRecordId || record.clientRecordId || record.recordId || record._id);
  if (!id || (submissionId && submissionId !== id)) return null;
  return {
    studentId,
    experimentId,
    submissionId: id,
    studentName: text(record.studentName || state.studentName),
    className: text(record.className || state.className),
    groupName: text(record.groupName || state.groupName || state.groupId),
    answers: state.fields || {},
    experimentResults: state
  };
}
async function archiveFor(submission) {
  try {
    const result = await archives.doc(archiveId(submission.studentId, submission.submissionId)).get();
    return Array.isArray(result.data) ? result.data[0] || null : null;
  } catch (error) { return null; }
}
async function temporaryUrl(fileID) {
  try {
    const result = await app.getTempFileURL({ fileList: [fileID] });
    return text(result.fileList?.[0]?.tempFileURL);
  } catch (error) { return ""; }
}
async function renderPdf(submission) {
  const reportUrl = text(process.env.REPORT_RENDER_URL);
  if (!/^https:\/\//i.test(reportUrl)) throw new Error("REPORT_RENDER_URL_MISSING");
  const puppeteer = require("puppeteer-core");
  const chromium = require("@sparticuz/chromium");
  const browser = await puppeteer.launch({
    args: await puppeteer.defaultArgs({ args: chromium.args, headless: "shell" }),
    executablePath: await chromium.executablePath(),
    headless: "shell"
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    const url = new URL(reportUrl);
    url.searchParams.set("archiveRender", "1");
    url.searchParams.set("activityType", submission.experimentId);
    await page.goto(url.toString(), { waitUntil: "networkidle0", timeout: 30000 });
    const rendered = await page.evaluate((record) => window.BrainReportArchive?.render(record) === true, submission);
    if (!rendered) throw new Error("REPORT_RENDER_FAILED");
    await page.evaluate(() => document.fonts.ready);
    return Buffer.from(await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true }));
  } finally {
    await browser.close();
  }
}
async function list(studentId) {
  const items = [];
  for (let index = 0; index < EXPERIMENTS.length; index += 1) {
    const experimentId = EXPERIMENTS[index];
    const submission = await latestSubmission(studentId, experimentId);
    const archive = submission && await archiveFor(submission);
    const url = archive?.fileID ? await temporaryUrl(archive.fileID) : "";
    items.push({
      experimentId,
      label: LABELS[index],
      submitted: Boolean(submission),
      submissionId: submission?.submissionId || "",
      archived: Boolean(url),
      url
    });
  }
  return { ok: true, items };
}
async function view(studentId, experimentId, submissionId) {
  const submission = await latestSubmission(studentId, experimentId, submissionId);
  if (!submission) return { ok: false, code: "NOT_FOUND" };
  const archive = await archiveFor(submission);
  if (!archive?.fileID || archive.studentId !== studentId || archive.experimentId !== experimentId || archive.submissionId !== submission.submissionId) {
    return { ok: false, code: "NOT_FOUND" };
  }
  try {
    const result = await app.downloadFile({ fileID: archive.fileID });
    const pdf = result.fileContent;
    if (!Buffer.isBuffer(pdf) || pdf.subarray(0, 5).toString() !== "%PDF-") return { ok: false, code: "VIEW_FAILED" };
    if (pdf.length > 4 * 1024 * 1024) return { ok: false, code: "PDF_TOO_LARGE" };
    return { ok: true, pdfBase64: pdf.toString("base64") };
  } catch (error) {
    return { ok: false, code: "VIEW_FAILED" };
  }
}
exports.main = async (event) => {
  const auth = session(event);
  if (!auth) return { ok: false, code: "UNAUTHORIZED" };
  const input = body(event);
  if (input.action === "list") return list(text(auth.studentId));
  if (input.action === "view" && EXPERIMENTS.includes(text(input.experimentId)) && ID_PATTERN.test(text(input.submissionId))) {
    return view(text(auth.studentId), text(input.experimentId), text(input.submissionId));
  }
  if (input.action !== "generate" || !EXPERIMENTS.includes(text(input.experimentId))) return { ok: false, code: "INVALID_REQUEST" };
  const submission = await latestSubmission(text(auth.studentId), text(input.experimentId), text(input.submissionId));
  if (!submission) return { ok: false, code: "NOT_FOUND" };
  const existing = await archiveFor(submission);
  if (existing?.fileID) {
    const url = await temporaryUrl(existing.fileID);
    if (url) return { ok: true, archived: true, url };
  }
  try {
    const pdf = await renderPdf(submission);
    const studentFolder = crypto.createHash("sha256").update(text(auth.studentId)).digest("hex").slice(0, 16);
    const cloudPath = `experiment-reports/${studentFolder}/${archiveId(auth.studentId, submission.submissionId)}.pdf`;
    const uploaded = await app.uploadFile({ cloudPath, fileContent: pdf });
    if (!uploaded?.fileID) throw new Error("UPLOAD_FAILED");
    await archives.doc(archiveId(auth.studentId, submission.submissionId)).set({
      studentId: text(auth.studentId),
      experimentId: submission.experimentId,
      submissionId: submission.submissionId,
      fileID: uploaded.fileID,
      createdAt: db.serverDate()
    });
    return { ok: true, archived: true, url: await temporaryUrl(uploaded.fileID) };
  } catch (error) {
    console.error("Report archive failed:", error);
    return { ok: false, code: "ARCHIVE_FAILED", retryable: true };
  }
};

exports.__test = { archiveId, session, renderPdf };
