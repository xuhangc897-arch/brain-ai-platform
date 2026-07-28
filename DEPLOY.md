# 部署入口

当前网页部署方式为 GitHub Actions 构建后发布 GitHub Pages，不再直接把仓库根目录作为 Pages 内容。

## 发布前

```bash
npm run verify
npm run build
npm run check:dist
```

## GitHub Pages 设置

首次启用新工作流时，在仓库：

1. 打开 `Settings → Pages`。
2. 将 `Build and deployment → Source` 设置为 `GitHub Actions`。
3. 确认 `github-pages` environment 只允许 `main` 部署。

合并到 `main` 后，`.github/workflows/pages.yml` 会：

1. 运行完整检查。
2. 构建最小静态发布包。
3. 校验发布包。
4. 部署 GitHub Pages。
5. 对线上关键页面执行只读冒烟检查。

`.github/workflows/pages-monitor.yml` 每小时检查一次线上站点。

CloudBase 云函数、数据库和 AI 后端不属于静态 Pages 工作流。它们的变更必须遵守各自的部署顺序。

完整操作、回滚和故障处理见 [docs/BUILD_DEPLOY_MONITOR.md](docs/BUILD_DEPLOY_MONITOR.md)。
