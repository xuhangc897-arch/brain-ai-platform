# 四次实验后的学习诊断

## 数据来源与边界

学习诊断只使用服务端读取的数据：

- 四个实验最新正式 `submission`；
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
diagnosisVersion, sourceFactsHash,
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
- 四次正式提交完整即可生成诊断；诊断直接从正式提交读取测验、实验结果和问卷，不依赖 `student_memories`。
- `sourceFactsHash` 未变化时直接返回当前版本；发生变化时生成新的不可变版本。
- 来源变化或结构校验失败时不移动当前指针，也不覆盖历史诊断。

新版正式提交未保存 `maxUnlockedStep` 时，诊断生成和学生端资格读取与实验记忆采用相同的读取兼容规则：只有 `submissionTime` 和三份完整实验后问卷都存在才推定七个探究环节完成；明确保存的进度字段优先。此兼容逻辑不写回历史提交。仅完成实验一时，教师后台显示 0 条学习诊断符合预期。

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

- `generateLearningDiagnosis`：学生签名会话、资格核验、客观计算、AI 结构化诊断和版本写入；AI 失败时回退到规则诊断。
- `getLearningDiagnosis`：只返回当前学生的精简视图、资格和提示状态。
- `getLearningDiagnosesAdmin`：要求教师CloudBase UID白名单，返回详细诊断和历史版本。

两个函数均需要与登录函数相同的 `STUDENT_SESSION_SECRET`。`generateLearningDiagnosis` 配置 `OPENAI_API_KEY` 后调用 DeepSeek，依据四次正式提交的限长摘录和客观指标丰富报告；完成资格与维度等级仍由规则决定。未配置密钥或模型输出不合格时使用规则诊断。
诊断依据四次正式提交和可用过程记录生成。仅完成实验一时不触发诊断生成，`learning_diagnoses` 为空是预期状态。
AI 诊断保留规则计算的五个维度等级，学生报告可在原有栏目内写更充分的观察和行动建议。来源文本变化或从规则版升级为 AI 版时会写入新的诊断版本；旧版本不覆盖。

## 部署

1. 备份原集合，创建 `learning_diagnoses` 及索引。
2. 将集合安全规则设为禁止客户端直接读写。
3. 部署三个诊断云函数并配置环境变量。
4. 为 `generateLearningDiagnosis` 和 `getLearningDiagnosis` 配置HTTP路径。
5. 发布静态资源。
6. 用两个学生账号验证隔离，用教师账号验证最新版和历史版本。

部署本次规则生成时，更新 `generateExperimentMemory`、`generateLearningDiagnosis` 和 `getLearningDiagnosis`；三个云函数需单独部署，静态 Pages 构建不会包含它们。
案件五和独立诊断页都会初始化学习记忆模块，为前四次实验补发生成请求。四次正式提交完整时，独立诊断页可直接触发诊断；诊断生成成功后页面自动重新读取。上线前需分别部署云函数与静态页面，再用原正式学生账号验证四份记忆与诊断。
本地上传包：`output/cloudbase/generateLearningDiagnosis.zip` 和 `output/cloudbase/getLearningDiagnosis.zip`，ZIP 根目录均含 `index.js` 与 `package.json`。用户可在现有同名普通云函数中上传并选择安装依赖，保留原 Node.js 20.19、60 秒超时、HTTP 路由及 `STUDENT_SESSION_SECRET`。

## 本地验证

```bash
npm run check:learning-diagnosis
npm run verify
npm run build
npm run check:dist
```

本地测试不调用真实CloudBase或DeepSeek。上线后仍需验证HTTP网关、函数环境变量、数据库事务、索引及真实AI返回。
