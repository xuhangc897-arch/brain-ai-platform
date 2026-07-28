"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "dist");
const packageJson = require(path.join(root, "package.json"));

const rootFiles = [
  "index.html",
  "login.html",
  "pretest.html",
  "memory.html",
  "nback.html",
  "interference.html",
  "strategies.html",
  "poster.html",
  "review.html",
  "auth.js",
  "cloudbase.js"
];
const directories = ["assets", "admin"];

function assertOutputPath() {
  if (path.dirname(output) !== root || path.basename(output) !== "dist") {
    throw new Error("拒绝清理非仓库 dist 目录。");
  }
}

function copyFile(relativePath) {
  const source = path.join(root, relativePath);
  const target = path.join(output, relativePath);
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
    throw new Error(`缺少构建源文件：${relativePath}`);
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function copyDirectory(relativeDirectory) {
  const sourceDirectory = path.join(root, relativeDirectory);
  for (const entry of fs.readdirSync(sourceDirectory, { withFileTypes: true })) {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(relativePath);
    } else if (entry.isFile()) {
      copyFile(relativePath);
    }
  }
}

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

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

assertOutputPath();
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

rootFiles.forEach(copyFile);
directories.forEach(copyDirectory);

fs.writeFileSync(path.join(output, ".nojekyll"), "");
fs.writeFileSync(path.join(output, "health.json"), `${JSON.stringify({
  schemaVersion: 1,
  status: "ok",
  version: process.env.DEPLOY_VERSION || packageJson.version,
  commit: process.env.GITHUB_SHA || "local",
  builtAt: new Date().toISOString()
}, null, 2)}\n`);

const files = walk(output)
  .filter((filePath) => path.basename(filePath) !== "deploy-manifest.json")
  .sort((left, right) => relative(left).localeCompare(relative(right)))
  .map((filePath) => ({
    path: relative(filePath),
    bytes: fs.statSync(filePath).size,
    sha256: sha256(filePath)
  }));

fs.writeFileSync(path.join(output, "deploy-manifest.json"), `${JSON.stringify({
  schemaVersion: 1,
  files
}, null, 2)}\n`);

const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
console.log(`Built ${files.length} deploy files (${totalBytes} bytes) in dist/.`);
