"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "cloudfunctions", "experimentReportArchive", "index.js"), "utf8");
const secret = "report-archive-test-secret-with-more-than-32-characters";
const submissionId = "memory|s-1|2026-10-14T12:00:00.000Z";
const otherSubmissionId = "memory|s-2|2026-10-14T12:00:00.000Z";
const records = [
  { studentId: "s-1", experimentId: "memory", submissionId, uploadedAt: 2 },
  { studentId: "s-2", experimentId: "memory", submissionId: otherSubmissionId, uploadedAt: 3 }
];
const legacyRecords = [{ studentId: "s-1", module: "nback", recordType: "submission", clientRecordId: "legacy-nback-s-1", data: { fullState: { studentName: "Student", fields: { question: "Q" } } } }];
const archiveDocs = {};
let downloadedFileID = "";
let downloadedContent = Buffer.from("%PDF-1.7 test");
let resolvePdf;
let startedPdf;
const pdfStarted = new Promise((resolve) => { startedPdf = resolve; });
let browserClosed = false;
const browser = {
  async newPage() { return {
    async setViewport() {},
    async goto() {},
    async evaluate() { return true; },
    pdf() { startedPdf(); return new Promise((resolve) => { resolvePdf = resolve; }); }
  }; },
  async close() { browserClosed = true; }
};
const app = {
  database: () => ({
    collection(name) {
      if (name === "experiment_submissions") return {
        where(condition) {
          assert.strictEqual(condition.studentId, "s-1", "queries must use the verified student ID");
          return {
            orderBy() { return this; },
            limit() { return this; },
            async get() { return { data: records.filter((record) => Object.keys(condition).every((key) => record[key] === condition[key])) }; }
          };
        }
      };
      if (name === "experiment_report_archives") return { doc: (id) => ({ get: async () => ({ data: archiveDocs[id] ? [archiveDocs[id]] : [] }) }) };
      if (name === "experimentRecords") return { where(condition) { return { orderBy() { return this; }, limit() { return this; }, async get() { return { data: legacyRecords.filter((record) => Object.keys(condition).every((key) => record[key] === condition[key])) }; } }; } };
      throw new Error(`Unexpected collection ${name}`);
    }
  }),
  getTempFileURL: async () => ({ fileList: [] }),
  downloadFile: async ({ fileID }) => { downloadedFileID = fileID; return { fileContent: downloadedContent }; }
};
const sandbox = {
  require: (name) => name === "crypto" ? crypto
    : name === "@cloudbase/node-sdk" ? { init: () => app, SYMBOL_CURRENT_ENV: "test" }
    : name === "puppeteer-core" ? { defaultArgs: async () => [], launch: async () => browser }
    : name === "@sparticuz/chromium" ? { args: [], executablePath: async () => "/tmp/chromium" }
    : require(name),
  process: { env: { STUDENT_SESSION_SECRET: secret, REPORT_RENDER_URL: "https://example.com/review.html" } },
  Buffer, URL, console,
  exports: {}
};
vm.runInNewContext(source, sandbox, { filename: "experimentReportArchive/index.js" });
const payload = Buffer.from(JSON.stringify({ version: 1, studentId: "s-1", issuedAt: Math.floor(Date.now() / 1000) - 5, expiresAt: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
const authorized = (body) => ({ headers: { Authorization: `Bearer ${payload}.${signature}` }, body });

(async () => {
  assert.strictEqual((await sandbox.exports.main({ body: { action: "list" } })).code, "UNAUTHORIZED");
  assert.strictEqual((await sandbox.exports.main(authorized({ action: "generate", experimentId: "poster" }))).code, "INVALID_REQUEST");
  const list = await sandbox.exports.main(authorized({ action: "list" }));
  assert.strictEqual(list.items.length, 4);
  assert.strictEqual(list.items[0].submitted, true);
  assert.strictEqual(list.items[0].submissionId, submissionId, "the list returns the actual pipe-delimited submission ID");
  assert.strictEqual(list.items[1].submitted, true, "legacy formal submissions remain available");
  assert.strictEqual(list.items[1].submissionId, "legacy-nback-s-1");
  assert.strictEqual((await sandbox.exports.main(authorized({ action: "view", experimentId: "memory", submissionId: "" }))).code, "INVALID_REQUEST");
  assert.strictEqual((await sandbox.exports.main(authorized({ action: "view", experimentId: "poster", submissionId }))).code, "INVALID_REQUEST");
  assert.strictEqual((await sandbox.exports.main(authorized({ action: "generate", experimentId: "memory", submissionId: otherSubmissionId }))).code, "NOT_FOUND");
  assert.strictEqual((await sandbox.exports.main(authorized({ action: "view", experimentId: "memory", submissionId: otherSubmissionId }))).code, "NOT_FOUND");
  assert.strictEqual((await sandbox.exports.main(authorized({ action: "view", experimentId: "memory", submissionId }))).code, "NOT_FOUND");
  const ownArchiveId = sandbox.exports.__test.archiveId("s-1", submissionId);
  archiveDocs[ownArchiveId] = { studentId: "s-2", experimentId: "memory", submissionId, fileID: "cloud://private/report.pdf" };
  assert.strictEqual((await sandbox.exports.main(authorized({ action: "view", experimentId: "memory", submissionId }))).code, "NOT_FOUND", "a mismatched archive owner must not be served");
  archiveDocs[ownArchiveId].studentId = "s-1";
  const viewed = await sandbox.exports.main(authorized({ action: "view", experimentId: "memory", submissionId }));
  assert.strictEqual(viewed.ok, true);
  assert.strictEqual(downloadedFileID, "cloud://private/report.pdf");
  assert.strictEqual(Buffer.from(viewed.pdfBase64, "base64").toString(), "%PDF-1.7 test");
  downloadedContent = Buffer.from("not a PDF");
  assert.strictEqual((await sandbox.exports.main(authorized({ action: "view", experimentId: "memory", submissionId }))).code, "VIEW_FAILED");
  downloadedContent = Buffer.concat([Buffer.from("%PDF-"), Buffer.alloc(4 * 1024 * 1024)]);
  assert.strictEqual((await sandbox.exports.main(authorized({ action: "view", experimentId: "memory", submissionId }))).code, "PDF_TOO_LARGE");
  const rendering = sandbox.exports.__test.renderPdf({ experimentId: "memory" });
  await pdfStarted;
  assert.strictEqual(browserClosed, false, "browser must remain open until PDF generation finishes");
  resolvePdf(new Uint8Array(Buffer.from("pdf")));
  const renderedPdf = await rendering;
  assert.strictEqual(Buffer.isBuffer(renderedPdf), true, "CloudBase upload requires a Buffer");
  assert.strictEqual(renderedPdf.toString(), "pdf");
  assert.strictEqual(browserClosed, true);
  assert.match(source, /page\.pdf\(/);
  assert.match(source, /app\.uploadFile\(/);
  const poster = fs.readFileSync(path.join(root, "poster.html"), "utf8");
  assert.match(poster, /<h3>读取实验数据<\/h3>/);
  assert.match(poster, /<h2>\$\{state\.currentStep \+ 1\}\. \$\{step\.title\}<\/h2>/);
  assert.match(poster, /if \(step\.id === "plan" && page < getArchivePageCount\(\)\) loadReportArchives\(\)/);
  assert.match(poster, /<span>接受校园委托<\/span>/);
  assert.match(poster, /URL\.createObjectURL\(new Blob\(\[bytes\], \{ type: "application\/pdf" \}\)\)/);
  assert.doesNotMatch(poster, /frame\.src = archive\.url/);
  console.log("Report archive student scope, four experiment list and commission step checks passed.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
