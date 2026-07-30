# 教育智能体平台

面向学生科学探究活动的静态网页平台，包含资格审查、五个实验活动、AI 学习助手、语音助手、统一报告、教师数据后台及腾讯云 CloudBase 后端。

## 开始开发前

必须先阅读根目录 [修改须知.md](修改须知.md)。该文件记录当前架构、禁止事项、验证命令、部署顺序和仍未解决的高风险遗留。

## 本地运行

需要 Node.js 20.19 或兼容的 Node 20：

```bash
npm run verify
npm run dev
```

浏览器打开：

```text
http://localhost:8080/login.html
```

## 构建与部署

```bash
npm run verify
npm run build
npm run check:dist
```

发布包生成在 `dist/`。合并到 `main` 后由 GitHub Actions 部署 GitHub Pages，并在部署后及每小时执行只读健康检查。

完整说明见：

- [构建、部署与监控](docs/BUILD_DEPLOY_MONITOR.md)
- [跨实验结构化学生记忆](docs/STUDENT_MEMORY.md)
- [四次实验后的学习诊断](docs/LEARNING_DIAGNOSIS.md)
- [平台契约](docs/PLATFORM_CONTRACTS.md)
- [实验注册表](docs/EXPERIMENT_REGISTRY.md)
- [实验页面迁移](docs/EXPERIMENT_PAGE_MIGRATION.md)
- [教师后台、报告与 AI 整合](docs/EXPERIMENT_INTEGRATION.md)
