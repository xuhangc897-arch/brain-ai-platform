# 虚拟学习伙伴整体技术与安全说明

本文对应第七阶段整体联调。范围仅包含稳定性、数据隔离、性能、交互和部署检查，不新增学习功能。

## 1. 组件结构与四个核心功能

统一入口由 `assets/memory-partner.js` 和 `assets/memory-partner.css` 提供，对外使用 `VirtualAgent.init()`，并保留 `MemoryPartner` 兼容接口。四个实验页各初始化一次，共用同一套组件；海报页仅使用基础工具，不参与行为监测、记忆和诊断。

虚拟人菜单的四个基础功能是：

1. AI 学习助手：调用现有 `assets/ai-assistant.js`，不复制模型请求逻辑。
2. 语音转文字：复用 `voice-recorder.js`、`asr-client.js` 和 `voice-assistant.js`，学生确认后写入当前目标输入框。
3. 当前任务：只读取页面已有步骤标题和任务说明。
4. 学习进度：只读取实验页面现有步骤和解锁状态。

扩展入口包括“我的学习记录”和“四次实验后的学习诊断”，是否显示由受保护的后端结果决定。

## 2. 主要前端模块

| 模块 | 责任 |
| --- | --- |
| `platform-core.js` | 环境配置、签名学生会话、身份字段和按账号隔离的浏览器存储键 |
| `experiment-page-runtime.js` | 四个实验页公共状态、步骤和报告运行时 |
| `experiment-uploader.js` | 实验记录上传、有限离线队列和上传确认事件 |
| `learning-behavior-tracker.js` | 开放性文本任务汇总指标，不保存逐键轨迹 |
| `typing-support-rules.js` / `typing-support.js` | 可解释的当前任务输入支持判断和非模态语音建议 |
| `task-relevance-config.js` / `task-relevance.js` | 任务配置、文本哈希去重、后台相关性检查和非阻塞提示 |
| `student-memory.js` | 实验记忆生成补偿、学生简化记录和环节相关支持 |
| `learning-diagnosis.js` / `diagnosis.js` | 四实验完成资格、诊断生成恢复和学生可打印视图 |

监测控制器使用事件委托和有界 `setTimeout`，没有输入框级永久轮询。页面离开使用本地最新快照和非阻塞 `keepalive`，不使用同步 XHR。

## 3. 主要云函数

| 云函数 | 用途 | 身份 |
| --- | --- | --- |
| `studentLogin` | 核验学生并签发24小时 HMAC 会话 | 学号和密码 |
| `saveExperimentRecord` | 保存实验状态、提交和工具记录 | 学生签名令牌 |
| `saveLearningRecord` | 按任务确定性更新行为汇总 | 学生签名令牌 |
| `saveAgentIntervention` | 保存输入、相关性和记忆支持干预 | 学生签名令牌 |
| `checkTaskRelevance` | 权威任务配置、本地初筛、AI JSON 校验 | 学生签名令牌 |
| `generateExperimentMemory` | 完成度核验、客观事实和结构化实验记忆 | 学生签名令牌 |
| `getStudentMemory` | 返回当前学生的简化记忆和适用支持 | 学生签名令牌 |
| `generateLearningDiagnosis` | 四实验核验、幂等版本和结构化诊断 | 学生签名令牌 |
| `getLearningDiagnosis` | 返回当前学生的资格与学生报告 | 学生签名令牌 |
| `getExperimentRecords`、`getStudentMemoriesAdmin`、`getLearningDiagnosesAdmin` | 教师端受保护查询 | CloudBase Auth UID + `teachers` 白名单 |

所有学生写接口都从签名令牌确定 `studentId`。请求体中的学号只能与令牌一致，不能用于切换数据归属。服务端还会核验 `students` 集合中的正式学生记录。

## 4. 集合与关键数据

- `students`：正式学生身份、姓名、班级和小组。
- `teachers`：教师 CloudBase Auth `uid`、`active` 和 `role`。
- `experimentRecords`：实验状态、正式提交、问卷、前后测和工具记录。
- `learning_records`：任务级最终文本、输入方式、时长、删除、停顿及 AI/语音使用。
- `agent_interventions`：输入支持、任务相关性和跨实验记忆支持的触发与响应。
- `student_memories`：每名学生每次实验一条结构化记忆，以及一条综合记忆。
- `learning_diagnoses`：不可变诊断版本和当前版本指针。

关键关联链为：

```text
studentId
  → experimentId
  → stageId
  → taskId
  → learning_records / agent_interventions
  → student_memories(experiment / overall)
  → learning_diagnoses(version / pointer)
```

## 5. 跨实验记忆与最终诊断

每次正式提交由服务端重新核验完成状态，再读取本实验的原始记录。任务数、成绩、用时、工具使用和干预次数由程序计算；AI 只接收有限长度的客观事实和学生作品摘要。单段最多800个 Unicode 字符，作品总量最多约4000个字符，不发送完整聊天或全部原始日志。

实验记忆以来源事实哈希去重，生成失败不会覆盖原记忆。实验二至四只在匹配的环节、学生开始操作后提供少量支持。

最终诊断必须同时具备四份最新正式提交和四份对应的最新实验记忆。来源事实哈希不变时复用已有诊断；变化后新增不可变版本。AI 不接收原始学习记录全文，服务端严格校验五个维度、证据来源、措辞和建议数量。

## 6. 权限、隐私与故障回退

- `learning_records`、`agent_interventions`、`student_memories`、`learning_diagnoses` 和 `experimentRecords` 必须禁止 Web 客户端直接读写。
- 学生只通过签名令牌访问自己的数据；教师查询必须同时通过 CloudBase Auth 和 `teachers` 白名单。
- 浏览器实验草稿、前测、AI 日志和跨页上下文使用按学生隔离的 storage key；切换账号不会复用另一学生的本地状态。
- 控制台不输出学生完整文本、令牌、Authorization、AI 请求正文或敏感配置。
- AI、语音、网络或 CloudBase 失败均只使相应后台功能降级；实验本地保存、步骤解锁和报告不依赖这些请求成功。

## 7. 建议索引

先按当前查询创建必要索引；CloudBase 控制台提示缺索引时再补，不为未出现的查询组合预建大量索引。

1. `students`：`studentId` 唯一。
2. `teachers`：`uid` 唯一；教师较多时增加 `active + role`。
3. `experimentRecords`：
   - `clientRecordId`（确认历史无重复后可设唯一）；
   - `studentId + module + recordType + uploadedAt`；
   - 教师筛选实际报缺索引时，再为常用的班级/实验筛选组合建立索引。
4. `learning_records`：
   - `studentId + updatedAt`；
   - `studentId + experimentId + stageId`。
5. `agent_interventions`：
   - `studentId + updatedAt`；
   - `studentId + experimentId + stageId`；
   - 教师按干预类型查询时增加 `studentId + interventionType + updatedAt`。
6. `student_memories`：
   - `studentId + memoryType + experimentOrder`；
   - `studentId + updatedAt`；
   - `className + experimentId + updatedAt`。
7. `learning_diagnoses`：
   - `studentId + recordType + diagnosisVersion`；
   - `className + recordType + generatedAt`；
   - `studentId + sourceFactsHash`。

任务记录和干预记录使用确定性文档 ID 更新，同一任务不会因重复保存不断新增文档。

## 8. 部署步骤

1. 备份现有集合，并确认当前线上 `STUDENT_SESSION_SECRET` 的准确值。不要重新生成；登录和所有受保护学生函数必须使用同一个值。
2. 创建缺少的集合和上述必要索引；将业务集合权限设为客户端不可直接读写。
3. 为以下云函数配置同一个 `STUDENT_SESSION_SECRET`：
   - `studentLogin`
   - `saveExperimentRecord`
   - `saveLearningRecord`
   - `saveAgentIntervention`
   - `checkTaskRelevance`
   - `generateExperimentMemory`
   - `getStudentMemory`
   - `generateLearningDiagnosis`
   - `getLearningDiagnosis`
4. 为 `checkTaskRelevance`、`generateExperimentMemory` 和 `generateLearningDiagnosis` 配置 `OPENAI_API_KEY`。
5. 先部署全部云函数。对四个带签名写入的 HTTP 路径启用 `POST, OPTIONS`，并允许 `Content-Type, Authorization` 请求头。
6. 在本地运行：

   ```powershell
   npm run verify
   npm run build
   npm run check:dist
   ```

7. 再发布静态资源。云函数和前端必须成套发布；只发布前端会导致旧函数不识别授权，只发布新函数会使旧前端请求缺少令牌。
8. 使用两个正式学生账号和一个教师账号执行完整线上验收，确认数据隔离后再开放给正式班级。

回滚时先回滚静态资源，再回滚云函数。不要删除已生成的学习记录、记忆或诊断版本。

## 9. 验收清单

每个测试学生至少验证：

1. 登录后依次完成 AI、语音、输入支持和三类相关性输入。
2. 完成实验一并看到实验记忆；进入实验二后只在匹配环节出现历史支持。
3. 完成四次实验并生成诊断；相同数据重复生成不新增版本。
4. 退出并登录另一账号，确认草稿、前测、工具日志、记忆和诊断均不串号。
5. 在浏览器开发者工具中临时修改请求体 `studentId`，确认服务端返回 `STUDENT_MISMATCH`。
6. 断网编辑后恢复网络，确认队列重试且页面始终可继续操作。
7. 教师端可查看授权范围内数据，匿名或停用教师不能查询。

## 10. 已知限制与后续方向

- 本地自动测试使用 CloudBase 和 AI 模拟对象；真实双学生、教师、麦克风、网关 CORS、数据库权限和 AI 返回必须在部署环境验收。
- 当前学生会话依赖浏览器 localStorage 保存签名令牌；XSS 防护仍依赖静态资源和第三方脚本治理。
- 学生密码的安全迁移、登录限流和异常登录审计应单独实施，避免在没有数据迁移方案时直接破坏现有账号。
- AI 与 ASR 对外端点还需要在部署侧配置来源限制、速率限制、预算告警和日志保留策略。
- 本地去重状态在清除浏览器数据或更换设备后不会保留；跨设备严格去重以服务端确定性记录为准。
- 诊断是教学支持信息，不构成心理或医学诊断。

