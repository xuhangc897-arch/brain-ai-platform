# 构建、部署与监控

本文档定义阶段 7 建立的静态站点发布流程。

## 一、本地构建

环境要求：Node.js 20.19。

```bash
npm run verify
npm run build
npm run check:dist
```

`npm run build` 只把以下内容放入 `dist/`：

- 九个学生/报告 HTML 页面。
- `auth.js`、`cloudbase.js`。
- `assets/`。
- `admin/`。
- `.nojekyll`、`health.json`、`deploy-manifest.json`。

云函数、API 后端、文档、脚本、数据库备份、开发服务器和历史副本不会进入发布包。

## 二、部署工作流

`.github/workflows/pages.yml` 在以下情况运行：

- 向 `main` 推送：检查、构建、部署和线上冒烟。
- 面向 `main` 的 Pull Request：检查、构建和发布包校验，不部署。
- 手动触发：检查、构建、部署和线上冒烟。

首次启用时，GitHub 仓库 `Settings → Pages → Build and deployment → Source` 必须选择 `GitHub Actions`。

部署使用：

- `actions/configure-pages@v5`
- `actions/upload-pages-artifact@v4`
- `actions/deploy-pages@v4`

发布环境为 `github-pages`，只允许 `main` 部署。

## 三、健康检查

发布包包含：

- `health.json`：版本、commit、构建时间和状态。
- `deploy-manifest.json`：每个发布文件的大小和 SHA-256。

`scripts/smoke-deployment.js` 只读检查：

- `health.json`
- 首页
- 实验注册表
- 平台核心
- 整合层
- 记忆报告入口
- 教师后台入口

部署工作流会在上线后立即运行一次。`.github/workflows/pages-monitor.yml` 每小时第 17 分钟运行，并支持手动触发。

本地或手动检查：

```bash
npm run monitor -- https://xuhangc897-arch.github.io/brain-ai-platform/
```

监控不登录、不提交表单、不读取学生数据、不调用 AI，也不写入 CloudBase。

## 四、发布顺序

仅静态页面变更：

1. 完成自动和人工测试。
2. 推送功能分支并创建 PR。
3. 等待 PR 构建检查通过。
4. 合并到 `main`。
5. 等待 Pages deploy job 成功。
6. 检查 deploy job 的线上冒烟结果。
7. 用无痕窗口人工检查首页、一个实验、报告和教师后台。

涉及实验记录 schema 时，仍必须先部署兼容新旧版本的 CloudBase 云函数，再部署静态页面。

## 五、回滚

1. 找到最后一个健康的 `main` commit。
2. 对故障 PR 创建 `git revert`，不要重写 `main` 历史。
3. 合并回滚 PR。
4. Pages 工作流自动重新构建和部署。
5. 检查线上冒烟和 `health.json` commit。

不要只回滚某一个公共脚本。注册表、平台核心、页面运行时、整合层和调用页面必须作为同一静态版本发布。

## 六、故障处理

- 构建失败：查看 `verify`、`build` 或 `check:dist` 的首个失败步骤。
- Pages 部署失败：确认 Pages Source 为 GitHub Actions，workflow 具有 `pages: write` 和 `id-token: write`。
- 冒烟失败：检查 Pages URL、缓存、`health.json` 和缺失资源；不要立即重跑覆盖证据。
- 定时监控失败：先手动触发一次，确认是暂时网络问题还是持续资源缺失。
- 页面脚本版本不一致：执行完整回滚或完整重新部署，不要手工覆盖单文件。
