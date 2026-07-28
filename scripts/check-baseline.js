"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const SKIPPED_DIRECTORIES = new Set([".git", "node_modules"]);
const SOURCE_EXTENSIONS = new Set([".html", ".js"]);
const LOCAL_REFERENCE_PATTERN = /\b(?:src|href)\s*=\s*["']([^"'#?]+)["']/gi;
const INLINE_SCRIPT_PATTERN = /<script([^>]*)>([\s\S]*?)<\/script>/gi;

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && SKIPPED_DIRECTORIES.has(entry.name)) return [];

    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(absolutePath);
    if (!SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) return [];
    return [absolutePath];
  });
}

function relative(filePath) {
  return path.relative(ROOT, filePath).replaceAll(path.sep, "/");
}

function getLineNumber(source, index) {
  return source.slice(0, index).split(/\r?\n/).length;
}

function isJavaScriptScriptTag(attributes) {
  if (/\bsrc\s*=/i.test(attributes)) return false;

  const typeMatch = attributes.match(/\btype\s*=\s*["']([^"']+)["']/i);
  if (!typeMatch) return true;

  const type = typeMatch[1].trim().toLowerCase();
  return type === "text/javascript" || type === "application/javascript" || type === "module";
}

function checkJavaScriptFile(filePath, failures) {
  const source = fs.readFileSync(filePath, "utf8");

  try {
    new vm.Script(source, { filename: relative(filePath) });
  } catch (error) {
    failures.push(`${relative(filePath)}: ${error.message}`);
  }
}

function checkInlineScripts(filePath, failures, totals) {
  const source = fs.readFileSync(filePath, "utf8");

  for (const match of source.matchAll(INLINE_SCRIPT_PATTERN)) {
    const attributes = match[1] || "";
    const script = match[2] || "";
    if (!script.trim() || !isJavaScriptScriptTag(attributes)) continue;

    totals.inlineScripts += 1;
    const line = getLineNumber(source, match.index);

    try {
      new vm.Script(script, {
        filename: `${relative(filePath)}:inline:${line}`
      });
    } catch (error) {
      failures.push(`${relative(filePath)}:${line}: ${error.message}`);
    }
  }
}

function isLocalReference(reference) {
  return !/^(?:[a-z]+:|\/\/)/i.test(reference) &&
    !reference.includes("{") &&
    !reference.includes("<") &&
    !reference.includes("$");
}

function resolveLocalReference(htmlFile, reference) {
  let decodedReference = reference;

  try {
    decodedReference = decodeURIComponent(reference);
  } catch (error) {
    // Keep the original reference so a malformed URL is reported as missing.
  }

  if (decodedReference.startsWith("/")) {
    return path.resolve(ROOT, `.${decodedReference}`);
  }

  return path.resolve(path.dirname(htmlFile), decodedReference);
}

function checkLocalReferences(filePath, failures, totals) {
  const source = fs.readFileSync(filePath, "utf8");

  for (const match of source.matchAll(LOCAL_REFERENCE_PATTERN)) {
    const reference = match[1].trim();
    if (!reference || !isLocalReference(reference)) continue;

    totals.localReferences += 1;
    const target = resolveLocalReference(filePath, reference);
    if (fs.existsSync(target)) continue;

    const line = getLineNumber(source, match.index);
    failures.push(`${relative(filePath)}:${line}: missing local reference "${reference}"`);
  }
}

function main() {
  const files = walk(ROOT);
  const javascriptFiles = files.filter((file) => path.extname(file).toLowerCase() === ".js");
  const htmlFiles = files.filter((file) => path.extname(file).toLowerCase() === ".html");
  const failures = [];
  const totals = {
    inlineScripts: 0,
    localReferences: 0
  };

  javascriptFiles.forEach((file) => checkJavaScriptFile(file, failures));
  htmlFiles.forEach((file) => {
    checkInlineScripts(file, failures, totals);
    checkLocalReferences(file, failures, totals);
  });

  console.log(
    `Baseline checked: ${javascriptFiles.length} JS files, ` +
    `${htmlFiles.length} HTML files, ${totals.inlineScripts} inline scripts, ` +
    `${totals.localReferences} local references.`
  );

  if (failures.length > 0) {
    console.error(`Baseline failed with ${failures.length} issue(s):`);
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exitCode = 1;
    return;
  }

  console.log("Baseline passed.");
}

main();
