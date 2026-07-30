# 四次实验后的学习诊断

## 数据来源与边界

学习诊断只使用服务端读取的数据：

- 四个实验最新正式 `submission`；
- 四份当前 `student_memories` 实验记忆；
- 对应的 `learning_records` 和 `agent_interventions`；
- 实验结果、知识测验和三份实验后问卷。

海报制作、完整AI聊天、未提交的浏览器本地状态不进入诊断。诊断只用于教学支持，不构成学生固定能力、人格、心理或医学判断。

## `learning_diagnoses`

集合禁止Web客户端直接读写，包含：

- `recordType=version`：成功生成的不可变完整版本；
- `recordType=pointer`：当前版本指针和一次性学生提示状态。

版本记录主要字段：

```text
schemaVersion, recordId, recordType,
studentId, studentName, className, groupName,
diagnosisVersion, sourceMemoryVersions, sourceFactsHash,
completedExperiments, objectiveMetrics, dimensions,
progressSummary, studentReport, teacherReport,
recommendations, sourceRecordIds, promptVersion,
generatedAt, createdAt, updatedAt
```

建议索引：

1. `studentId + recordType + diagnosisVersion`
2. `className + recordType + generatedAt`
3. `studentId + sourceFactsHash`

## 完成资格与版本

- 后端逐一验证 `memory`、`nback`、`interference`、`strategies` 最新提交的七个探究环节和三份实验后问卷。
- 旧学生缺少新版知识测验时仍可生成，但相应指标标记为不可用。
- 四份实验记忆必须与最新提交的 `recordId` 一致，否则先补生成记忆。
- `sourceFactsHash` 未变化时直接返回当前版本；发生变化时生成新的不可变版本。
- AI失败、来源变化或结构校验失败时不移动当前指针，也不覆盖历史诊断。

## 诊断维度

固定包含：

```text
memory_knowledge
scientific_inquiry
evidence_use
metacognitive_regulation
tool_use
```

等级为 `consistent`、`developing`、`support_recommended` 或 `insufficient_data`。每项证据必须列出来源实验。学生端只显示友好名称、证据摘要、变化和行动建议。

教师端固定显示：

> 本诊断仅基于本平台中的学习过程和任务表现，用于教学支持，不构成心理或医学诊断。

## 云函数

- `generateLearningDiagnosis`：学生签名会话、资格核验、客观计算、AI结构化诊断和版本写入。
- `getLearningDiagnosis`：只返回当前学生的精简视图、资格和提示状态。
- `getLearningDiagnosesAdmin`：要求教师CloudBase UID白名单，返回详细诊断和历史版本。

`generateLearningDiagnosis` 需要 `STUDENT_SESSION_SECRET` 和 `OPENAI_API_KEY`；`getLearningDiagnosis` 需要相同的 `STUDENT_SESSION_SECRET`。

## 部署

1. 备份原集合，创建 `learning_diagnoses` 及索引。
2. 将集合安全规则设为禁止客户端直接读写。
3. 部署三个诊断云函数并配置环境变量。
4. 为 `generateLearningDiagnosis` 和 `getLearningDiagnosis` 配置HTTP路径。
5. 发布静态资源。
6. 用两个学生账号验证隔离，用教师账号验证最新版和历史版本。

## 本地验证

```bash
npm run check:learning-diagnosis
npm run verify
npm run build
npm run check:dist
```

本地测试不调用真实CloudBase或DeepSeek。上线后仍需验证HTTP网关、函数环境变量、数据库事务、索引及真实AI返回。
