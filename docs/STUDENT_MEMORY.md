# 跨实验结构化学生记忆

## 数据边界

- `experimentRecords`、`learning_records`、`agent_interventions` 继续保存原始过程记录。
- `student_memories` 只保存服务端计算事实、有限长度AI摘要和来源记录 ID，不保存完整聊天。
- 每名学生每个实验一条 `memoryType=experiment` 文档，另有一条 `memoryType=overall` 文档。
- 文档 ID 分别由 `studentId|experiment|experimentId` 和 `studentId|overall` 的 SHA-256 生成。
- 生成失败、AI超时或结构校验失败时不更新现有文档。

## `student_memories` 主要字段

```text
schemaVersion, recordId, memoryType,
studentId, studentName, className, groupName,
experimentId, experimentOrder, completedAt,
objectiveFacts, summary, sourceRecordIds,
sourceSubmissionRecordId, sourceFactsHash,
version, promptVersion, generatedAt, createdAt, updatedAt
```

综合记忆额外包含：

```text
completedExperiments, stableStrengths, currentNeedsSupport,
preferredSupportMode, progressChanges, nextSupport,
lastCompletedExperiment
```

建议索引：

1. `studentId + memoryType + experimentOrder`
2. `studentId + updatedAt`
3. `className + experimentId + updatedAt`

集合权限必须禁止 Web 客户端直接读写。

## 身份与教师权限

- `studentLogin` 需要环境变量 `STUDENT_SESSION_SECRET`，值至少32个字符。
- 学生登录令牌有效期24小时。记忆生成和读取只接受令牌中的学号，不接受前端另行指定学号。
- 创建 `teachers` 集合，教师文档至少包含：

```javascript
{
  uid: "<CloudBase Auth uid>",
  role: "teacher",
  active: true,
  displayName: "..."
}
```

- 为 `uid` 建立唯一索引，并为 `active + role` 建立查询索引。
- 教师须通过 `admin/login.html` 使用 CloudBase Auth 登录。`getExperimentRecords`、`getStudentMemoriesAdmin` 和 `createStudents` 均在服务端校验教师白名单。

## 40题前测

`assets/knowledge-question-bank.js` 是浏览器端公共题库。四个实验各10题，题目 ID 为：

```text
memory_q1..q10
nback_q1..q10
interference_q1..q10
strategies_q1..q10
```

资格审查第一次生成随机顺序后保存在 `knowledgePretest.questionOrder`。正式提交后答案锁定，并按实验保存四组分数。旧版已完成资格审查但没有 `knowledgePretest` 的学生不会被强制补做，生成记忆时显示前测不可用。

## 云函数

- `generateExperimentMemory`：验证签名会话，从数据库读取最新 submission 和过程记录，计算事实，调用 DeepSeek 并更新实验及综合记忆。
- `getStudentMemory`：验证签名会话，只返回当前学生的简化记录和当前实验可用支持。
- `getStudentMemoriesAdmin`：验证教师 CloudBase UID，返回教师详细视图。
- `saveAgentIntervention`：额外接受 `interventionType=memory_support`。

已保存的新版正式提交没有 `maxUnlockedStep`。记忆生成在读取时仅对具有 `submissionTime` 且三份实验后问卷完整的此类提交，推定七个探究环节已完成；若记录明确保留了 `maxUnlockedStep`，仍以该值为准。不修改数据库原记录或 `schemaVersion`。完成实验一后即可生成该实验的学习记忆；学习诊断仍需完成四个实验。

AI输入最多选取研究问题、假设、分析、结论和反思各一段，每段最多800个Unicode字符、合计最多4000字符。AI输出必须通过代码枚举、长度、阶段和来源任务 ID 校验。
结构化摘要请求使用 DeepSeek 非思考模式和 4000 token 输出上限；空内容、截断和非法 JSON 分别返回稳定错误码，均不写入不完整记忆，也不记录原始模型正文。

## 部署顺序

1. 备份现有集合，并创建 `teachers`、`student_memories` 及索引。
2. 禁止客户端直接访问 `student_memories`，确认 `teachers` 仅服务端可读写。
3. 配置 `STUDENT_SESSION_SECRET` 和现有 `OPENAI_API_KEY`。
4. 先部署 `studentLogin`、`createStudents`、`getExperimentRecords`、`saveAgentIntervention`。
5. 再部署 `generateExperimentMemory`、`getStudentMemory`、`getStudentMemoriesAdmin`。
6. 最后发布静态资源。旧登录会话没有签名令牌，发布后需重新登录一次。
7. 使用两个学生账号验证互相不可读取，再使用教师白名单账号验证后台查询。

修复既有正式提交的记忆缺失时，应先部署新版 `generateExperimentMemory` 云函数；GitHub Pages 发布不会部署云函数。备份并核对 `experiment_submissions` 中的正式提交后，让同一正式学生账号重新进入下一实验以触发前次记忆生成，再用教师后台查询 `student_memories`。若仍为空，按云函数返回码继续检查 AI、`learning_records` 和函数配置，不直接改写提交或记忆集合。
2026-10-12 的线上日志显示正式提交已通过完成检查，但 DeepSeek 返回内容无法解析，报 `AI_INVALID_JSON`；是否具体由截断或空内容造成，旧日志无法区分。部署本次生成修复后，保留原正式提交，重试待处理的记忆生成，并用新错误码及集合写入结果复核。

回滚时先回滚静态资源，再回滚云函数。已经生成的 `student_memories` 保留，不应在回滚中删除。

## 本地验证

```bash
npm run check:student-memory
npm run verify
npm run build
npm run check:dist
```

本地模拟不会调用真实 CloudBase 或AI。上线前仍需验证HTTP触发器、CloudBase Auth上下文、集合权限、索引和AI环境变量。
