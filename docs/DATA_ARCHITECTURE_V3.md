# 三层数据架构 v3

## 数据边界

- localStorage：仅保存学生当前未提交状态、页面进度和可靠上传队列，不作为正式研究数据来源。
- `experiment_submissions`：保存资格审查、四个实验和海报的正式成果，每次主动提交形成不可变记录。
- `learning_records`、`ai_chat_records`、`agent_interventions`：分别保存学习行为、AI 提问及回答状态和智能支架过程。
- `ai_chat_records` 的新记录先保存问题，再保存 AI 回答；`ai_prompt_events` 单独保存提问提醒的展示、点击和关闭事件。
- 正式学生的 AI 待同步队列按学生隔离，最多 1000 条、最长保留 365 天；满额时停止发送新问题，不丢弃旧问题。提醒事件队列使用相同上限。
- `experimentRecords`：只作为历史兼容集合保留；新实验正式提交和新 AI 问答不再写入该集合。

## 正式提交与报告

学生端通过 `submitExperimentSubmission()` 构建统一结构并先写入独立 outbox。只有 `saveExperimentSubmission` 确认写入或确认重复后，页面才携带 `submissionId` 打开报告。正式学生的报告通过 `getLatestExperimentSubmission` 读取已确认提交；游客报告是明确标识的本地预览。

教师端通过 `getExperimentSubmissionsAdmin` 合并新正式提交和历史 `experimentRecords` submission，通过 `getAiChatRecordsAdmin` 合并新单条 AI 记录和历史批量 AI logs。

教师数据管理继续只通过云函数访问受保护集合：`getStudentsAdmin` 返回不含密码的分页学生名单，`deleteStudentAdmin` 只删除学生账号文档并保留历史研究数据；`createExperimentRecordAdmin` 以统一正式提交结构新增教师审计记录，`deleteExperimentRecordAdmin` 只允许删除 `experiment_submissions` 或历史 `experimentRecords` 中的正式 submission。删除正式提交不会级联删除已经生成的学习记忆或学习诊断。

## CloudBase 部署要求

新增集合：

- `experiment_submissions`
- `ai_chat_records`
- `ai_prompt_events`

三个集合均应禁止 Web 客户端直接读写，只允许云函数访问。`askAiChat` 需要与学生登录函数相同的 `STUDENT_SESSION_SECRET` 和 AI 服务密钥 `OPENAI_API_KEY`。部署云函数与静态页面时，先部署云函数并确认其 HTTP 网关可用，再切换页面请求地址。建议索引：

- `experiment_submissions`：`studentId + experimentId + uploadedAt`、`submissionId`
- `ai_chat_records`：`studentId + experimentId + uploadedAt`、`clientRecordId`、`recordId`
- `ai_prompt_events`：`studentId + experimentId + uploadedAt`、`eventId`

部署顺序：先创建集合、权限和索引，再部署 `cloudbase.json` 中列出的云函数，最后部署静态站点。部署后使用正式测试学生和教师账号验证提交、最新报告、AI 单条记录、学生账号管理、正式实验记录管理及后台导出。
