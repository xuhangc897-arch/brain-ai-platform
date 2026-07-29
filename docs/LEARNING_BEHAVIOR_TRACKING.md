# 学习行为记录部署说明

本模块仅采集四个实验页中显式标记的开放性文本框汇总指标，不保存逐键轨迹，也不包含主动提醒、内容判断、跨实验记忆或学习诊断。

第三阶段的输入支持规则和干预记录见 `TYPING_SUPPORT.md`；学习行为记录的数据结构保持不变。

## 身份与写入边界

前端复用 `BrainPlatform.identity` 中的正式学生会话。缺少 `studentId` 或处于游客模式时，不写本地队列和 CloudBase。`saveLearningRecord` 云函数会再次查询 `students` 集合；未知学号会被拒绝。现有前端会话保存在 localStorage，仍可能被手工替换为另一个有效学号，强化登录凭证不属于本阶段。

## `learning_records` 字段

集合中的每个文档对应一个 `studentId + experimentId + stageId + taskId`：

`schemaVersion`、`recordId`、`studentId`、`studentName`、`className`、`groupName`、`experimentId`、`stageId`、`taskId`、`inputText`、`inputMethod`、`typingDurationMs`、`activeTypingDurationMs`、`effectiveCharacterCount`、`keyboardInputCharacterCount`、`deleteCount`、`largeDeleteCount`、`pauseCount`、`longestPauseMs`、`aiUsed`、`voiceUsed`、`taskStatus`、`firstFocusedAt`、`firstInputAt`、`lastInputAt`、`pageId`、`savedAt`、`submittedAt`、`createdAt`、`updatedAt`。

文档 ID 由上述四个标识的 SHA-256 生成。计数和使用标记单调合并；已提交状态不会被普通保存降级。有效字数由服务端重新计算，姓名、班级和小组以 `students` 集合为准。

## CloudBase 部署

1. 创建 `learning_records` 集合，并禁止 Web 客户端直接读写。
2. 创建复合索引：
   - `studentId` 升序 + `updatedAt` 降序；
   - `studentId` 升序 + `experimentId` 升序 + `stageId` 升序。
3. 部署 `saveLearningRecord` 云函数。
4. 发布静态资源，再用正式学生账号分别验证首次创建与重复更新。

记录沿用现有研究数据保留策略，保留至研究管理员人工清理。本阶段不创建学生端查询接口或定时删除任务。回滚时先恢复静态资源，再停用云函数；已有记录保留。

## 调试与故障回退

开发时可在加载监测脚本前设置 `window.AGENT_DEBUG = true`。控制台只显示任务标识、计数、时长、输入方式和工具使用标记，不输出身份或完整文本。生产环境不设置该值。

网络或云函数失败时，浏览器在 `learning-behavior-outbox-v1` 中仅保留每项任务的最新快照，最多 100 项、最长 7 天，并在联网后重试。页面关闭使用 `keepalive` 请求，不阻塞离开；原有实验保存、解锁和报告流程不依赖该请求。
