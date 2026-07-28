"use strict";

const baseUrlArgument = process.argv.find((argument) => /^https?:\/\//i.test(argument));
const baseUrl = String(process.env.DEPLOY_URL || baseUrlArgument || "").trim();
const checks = [
  ["health.json", /"status"\s*:\s*"ok"/],
  ["index.html", /记忆侦探/],
  ["assets/experiment-registry.js", /BrainExperimentRegistry/],
  ["assets/platform-core.js", /BrainPlatform/],
  ["assets/experiment-integration.js", /BrainExperimentIntegration/],
  ["review.html?activityType=memory", /reviewRoot/],
  ["admin/dashboard.html", /实验数据后台/]
];

if (!baseUrl) {
  throw new Error("缺少部署地址。请设置 DEPLOY_URL 或传入 https://... 地址。");
}
if (!/^https:\/\//i.test(baseUrl) && !/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\//i.test(baseUrl)) {
  throw new Error("部署监控只允许 HTTPS 或本地 HTTP 地址。");
}

const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;

async function fetchWithRetry(relativePath) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(new URL(relativePath, normalizedBaseUrl), {
        cache: "no-store",
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(`${relativePath} 检查失败：${lastError && lastError.message || "unknown"}`);
}

async function main() {
  for (const [relativePath, expectedPattern] of checks) {
    const body = await fetchWithRetry(relativePath);
    if (!expectedPattern.test(body)) {
      throw new Error(`${relativePath} 响应内容不符合预期。`);
    }
  }
  console.log(`Deployment smoke test passed: ${normalizedBaseUrl}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
