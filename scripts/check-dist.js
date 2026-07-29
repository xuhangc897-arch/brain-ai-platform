"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "dist");
const localReferencePattern = /\b(?:src|href)\s*=\s*["']([^"'#?]+)["']/gi;
const requiredFiles = [
  ".nojekyll",
  "health.json",
  "deploy-manifest.json",
  "index.html",
  "login.html",
  "memory.html",
  "nback.html",
  "interference.html",
  "strategies.html",
  "poster.html",
  "pretest.html",
  "review.html",
  "auth.js",
  "cloudbase.js",
  "assets/experiment-registry.js",
  "assets/platform-core.js",
  "assets/experiment-uploader.js",
  "assets/experiment-bridge.js",
  "assets/experiment-page-runtime.js",
  "assets/experiment-integration.js",
  "assets/ai-assistant.js",
  "assets/knowledge-question-bank.js",
  "assets/student-memory.js",
  "assets/review.js",
  "admin/dashboard.html",
  "admin/login.html",
  "admin/initStudents.html"
];
const forbiddenRoots = [
  ".git",
  ".github",
  "api",
  "cloudfunctions",
  "docs",
  "scripts",
  "node_modules",
  "备份",
  "脑育智能体"
];
const forbiddenFiles = [
  "app.js",
  "local-static-server.js",
  "ai-assistant.js",
  "cloudbase.json",
  "package.json",
  "修改须知.md"
];

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(absolutePath);
    return [absolutePath];
  });
}

function relative(filePath) {
  return path.relative(output, filePath).replaceAll(path.sep, "/");
}

function isLocalReference(reference) {
  return !/^(?:[a-z]+:|\/\/)/i.test(reference) &&
    !reference.includes("{") &&
    !reference.includes("<") &&
    !reference.includes("$");
}

if (!fs.existsSync(output)) {
  throw new Error("dist/ 不存在，请先运行 npm run build。");
}

for (const relativePath of requiredFiles) {
  if (!fs.existsSync(path.join(output, relativePath))) {
    throw new Error(`发布包缺少文件：${relativePath}`);
  }
}

for (const relativePath of forbiddenRoots) {
  if (fs.existsSync(path.join(output, relativePath))) {
    throw new Error(`发布包包含禁止目录：${relativePath}`);
  }
}
for (const relativePath of forbiddenFiles) {
  if (fs.existsSync(path.join(output, relativePath))) {
    throw new Error(`发布包包含禁止文件：${relativePath}`);
  }
}

const files = walk(output);
for (const htmlFile of files.filter((filePath) => path.extname(filePath).toLowerCase() === ".html")) {
  const source = fs.readFileSync(htmlFile, "utf8");
  for (const match of source.matchAll(localReferencePattern)) {
    const reference = match[1].trim();
    if (!reference || !isLocalReference(reference)) continue;
    const target = reference.startsWith("/")
      ? path.join(output, reference.slice(1))
      : path.resolve(path.dirname(htmlFile), reference);
    if (!fs.existsSync(target)) {
      throw new Error(`${relative(htmlFile)} 引用了发布包中不存在的文件：${reference}`);
    }
  }
}

const health = JSON.parse(fs.readFileSync(path.join(output, "health.json"), "utf8"));
if (health.schemaVersion !== 1 || health.status !== "ok" || !health.version || !health.commit) {
  throw new Error("health.json 格式无效。");
}

const manifest = JSON.parse(fs.readFileSync(path.join(output, "deploy-manifest.json"), "utf8"));
const actualFiles = files
  .map(relative)
  .filter((filePath) => filePath !== "deploy-manifest.json")
  .sort();
const manifestFiles = manifest.files.map((file) => file.path).sort();
if (JSON.stringify(actualFiles) !== JSON.stringify(manifestFiles)) {
  throw new Error("deploy-manifest.json 与实际发布文件不一致。");
}

const totalBytes = files.reduce((sum, filePath) => sum + fs.statSync(filePath).size, 0);
console.log(`Deployment package passed: ${files.length} files, ${totalBytes} bytes.`);
