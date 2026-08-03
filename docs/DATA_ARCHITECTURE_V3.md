# 三层数据架构 v3

## 数据边界

- localStorage：仅保存学生当前未提交状态、页面进度和可靠上传队列，不作为正式研究数据来源。
- `experiment_submissions`：保存四个实验和海报的正式成果，每次主动提交形成不可变记录。
- `learning_records`、`ai_chat_records`、`agent_interventions`：分别保存学习行为、有效 AI 问答和智能支架过程。
- `experimentRecords`：只作为历史兼容集合保留；新实验正式提交和新 AI 问答不再写入该集合。

## 正式提交与报告

学生端通过 `submitExperimentSubmission()` 构建统一结构并先写入独立 outbox。只有 `saveExperimentSubmission` 确认写入或确认重复后，页面才携带 `submissionId` 打开报告。正式学生的报告通过 `getLatestExperimentSubmission` 读取已确认提交；游客报告是明确标识的本地预览。

教师端通过 `getExperimentSubmissionsAdmin` 合并新正式提交和历史 `experimentRecords` submission，通过 `getAiChatRecordsAdmin` 合并新单条 AI 记录和历史批量 AI logs。

## CloudBase 部署要求

新增集合：

- `experiment_submissions`
- `ai_chat_records`

两个集合均应禁止 Web 客户端直接读写，只允许云函数访问。建议索引：

- `experiment_submissions`：`studentId + experimentId + uploadedAt`、`submissionId`
- `ai_chat_records`：`studentId + experimentId + uploadedAt`、`clientRecordId`

部署顺序：先创建集合、权限和索引，再部署 `cloudbase.json` 中新增的五个云函数，最后部署静态站点。部署后使用正式测试学生和教师账号验证提交、最新报告、AI 单条记录及后台导出。
