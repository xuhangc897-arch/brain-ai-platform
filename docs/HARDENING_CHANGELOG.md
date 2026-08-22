# 平台工程加固变更记录

本文件持续记录工程加固过程中实际完成的修改。每次加固任务必须补充一条记录，并写明范围、原因、行为影响、验证结果和回滚方式。

## 记录规则

- 一次记录只对应一个边界清晰的任务。
- 明确区分工程性修改、数据迁移和业务功能修改。
- 不使用“优化”“调整”等无法追溯的笼统描述。
- 涉及数据结构时，必须记录 schema 版本和迁移方式。
- 涉及学生实验流程时，必须记录人工回归结果。

---

## 2026-07-28｜任务 001：建立只读基线检查

### 目标

在不改变学生端、教师端或云函数行为的前提下，为后续加固建立可重复执行的最低限度检查。

### 影响范围

- 新增仓库只读检查脚本。
- 新增 npm 检查命令。
- 新增加固变更记录和长期注意事项文档。
- 不修改任何 HTML 页面、实验逻辑、认证逻辑、云函数或数据库。

### 修改文件

- `package.json`
- `scripts/check-baseline.js`
- `docs/HARDENING_CHANGELOG.md`
- `docs/HARDENING_GUARDRAILS.md`

### 修改原因

项目缺少统一的语法和资源引用检查。后续抽取公共模块或迁移数据时，如果没有固定基线，无法可靠判断修改是否引入基础回归。

### 行为影响

- 不改变生产行为。
- 不改变现有 `dev` 和 `start` 命令。
- 仅新增手动执行的 `npm run check:baseline`。

### 验证结果

- 使用工作区提供的 Node.js 直接运行 `scripts/check-baseline.js`：通过。
- 已检查 19 个独立 JavaScript 文件。
- 已检查 17 个 HTML 文件和其中 30 段内联脚本。
- 已检查 88 个本地 `src` / `href` 引用，未发现缺失。
- `git diff --check`：通过，未发现新增空白错误。
- 尝试通过当前桌面线程的 pnpm 运行 npm script 时，工具 shell 的 `PATH` 中没有 `node`，因此 pnpm 无法启动子脚本；这是当前执行环境问题。检查脚本本身已使用同一工作区 Node.js 运行通过。
- pnpm 测试自动生成的 `.pnpm-store/`、`node_modules/` 和 `pnpm-lock.yaml` 已在验收前清理，未纳入本次修改。

### 回滚方式

删除新增的检查命令、脚本和两份文档即可；不涉及数据回滚。

---

## 2026-07-28｜任务 002：清理登录与 ASR 敏感调试输出

### 目标

在不改变学生登录判断和语音识别连接流程的前提下，停止把密码、学生记录、完整请求、数据库结果和 ASR 签名调试信息写入日志或额外返回给客户端。

### 影响范围

- `studentLogin` 云函数的日志内容。
- ASR 签名服务的日志和成功响应中的调试字段。
- 不修改登录请求字段、登录结果、密码比较逻辑或 ASR `wsUrl`。
- 不修改任何学生实验页面。

### 修改文件

- `cloudfunctions/studentLogin/index.js`
- `app.js`
- `docs/HARDENING_CHANGELOG.md`
- `docs/HARDENING_GUARDRAILS.md`

### 修改原因

原登录函数会记录输入密码、数据库密码、完整学生对象、完整请求和数据库响应。ASR 服务会记录签名，并在响应中额外返回签名原文和完整查询参数。这些信息不参与业务逻辑，但会扩大凭据和学生数据暴露范围。

### 行为影响

- 学生登录成功和失败条件保持不变。
- 登录接口返回结构保持不变。
- ASR 成功响应继续返回 `{ wsUrl }`；删除当前客户端未使用的 `debug` 字段。
- 语音客户端已确认只读取 `wsUrl`。

### 验证结果

- 使用工作区提供的 Node.js 运行项目基线检查：通过；覆盖 19 个独立 JavaScript 文件、17 个 HTML 文件、30 段内联脚本和 88 个本地资源引用。
- `node --check cloudfunctions/studentLogin/index.js`：通过。
- `node --check app.js`：通过。
- 全仓调用检查确认 `assets/asr-client.js` 只校验并读取 `data.wsUrl`，不依赖已移除的 `debug` 字段。
- 定向检索未发现密码、学生 ID、完整登录对象、ASR 签名或签名原文继续写入日志。
- `git diff --check`：通过；仅出现仓库现有的 LF/CRLF 转换提示，无新增空白错误。
- 未调用真实 CloudBase 登录接口或腾讯云 ASR 服务；本次没有可用的隔离测试账号和测试环境凭据，因此线上连通性留待部署前冒烟测试。

### 回滚方式

恢复原日志和 ASR `debug` 响应即可；不涉及数据库或学生实验数据回滚。

---

## 2026-07-28｜任务 003：最小化 CloudBase 与教师导入诊断信息

### 目标

在不改变 CloudBase 匿名登录策略、教师导入调用顺序和 HTTP 回退行为的前提下，停止在浏览器控制台输出完整登录态、用户对象、学生导入名单和云函数原始响应。

### 影响范围

- CloudBase 登录态检查与匿名登录过程的控制台日志。
- 教师批量导入页调用 `createStudents` 时的诊断日志。
- 不关闭教师后台临时免登录开关。
- 不增加教师角色校验，不修改 `createStudents` HTTP 回退。
- 不修改学生登录、实验页面、实验记录上传或数据库结构。

### 修改文件

- `cloudbase.js`
- `admin/initStudents.html`
- `docs/HARDENING_CHANGELOG.md`
- `docs/HARDENING_GUARDRAILS.md`

### 修改原因

原实现会把完整 CloudBase 登录态、当前用户、学生导入数组和云函数原始返回值写入浏览器控制台。教师共用设备、远程排错截图或浏览器日志采集都可能因此暴露学生身份信息及会话凭据。认证体系尚未具备安全收口条件，但这些诊断信息可以在不改变业务调用链的情况下先行移除。

### 行为影响

- CloudBase 登录态检查、匿名登录策略及失败后的策略轮询保持不变。
- `createStudents` 优先使用 `callFunction`、权限失败时改用 HTTP 网关的顺序保持不变。
- 教师页面仍显示原有导入结果和错误提示。
- 日志只保留必要错误码、环境标识和布尔能力状态，不再包含完整用户、登录态、学生数组或云函数响应。
- 删除因本次日志清理而失去调用方的 `getAuthMethodNames()` 调试辅助函数。

### 验证结果

- 使用工作区提供的 Node.js 运行项目基线检查：通过；覆盖 19 个独立 JavaScript 文件、17 个 HTML 文件、30 段内联脚本和 88 个本地资源引用。
- `node --check cloudbase.js`：通过。
- 定向检索确认不再输出 CloudBase 完整登录态、当前用户、学生导入数组或 `createStudents` 原始响应。
- 差异复核确认 `ensureCloudBaseLogin()` 的登录态读取、两个匿名登录策略和返回值保持不变。
- 差异复核确认 `createStudents` 的 `callFunction`、超时处理、权限失败判断及 HTTP 回退顺序保持不变。
- `git diff --check`：通过；仅出现仓库现有的 LF/CRLF 转换提示，无新增空白错误。
- 未使用真实教师账号执行浏览器导入；仓库尚无正式教师身份模型和隔离测试账号，部署前仍需完成教师导入冒烟测试。

### 未处理的阻塞项

当前不能安全关闭教师后台免登录或 HTTP 回退：仓库中没有正式教师账号入口、教师角色字段和服务端授权规则，`initStudents` 当前还依赖匿名登录。实施前需要先确定教师身份来源、CloudBase 安全规则及隔离测试账号。

### 回滚方式

恢复上述诊断日志和调试对象即可；不涉及数据库、学生账号或实验数据回滚。

---

## 2026-07-28｜任务 004：最小化实验记录云函数日志

### 目标

在不改变实验记录保存、去重、查询、筛选和返回结构的前提下，停止将学生身份筛选值和客户端记录标识写入云函数日志。

### 影响范围

- `saveExperimentRecord` 跳过无效记录时的警告日志。
- `getExperimentRecords` 执行查询时的条件摘要日志。
- 不修改请求字段、数据库条件、记录文档、去重规则、返回值或 HTTP 状态。
- 不修改任何学生实验页面和前端上传逻辑。

### 修改文件

- `cloudfunctions/saveExperimentRecord/index.js`
- `cloudfunctions/getExperimentRecords/index.js`
- `docs/HARDENING_CHANGELOG.md`
- `docs/HARDENING_GUARDRAILS.md`

### 修改原因

原查询日志会记录具体学号、班级、小组和其他筛选值；无效记录日志会记录学号及 `clientRecordId`。这些值不是定位云函数运行状态所必需，长期保留会扩大实验数据和学生身份信息的暴露范围。

### 行为影响

- 保存日志继续保留模块、记录类型和记录数量。
- 无效记录日志改为记录缺失字段的布尔状态，不记录字段值。
- 查询日志改为记录启用的筛选字段名称、分页参数和额外筛选是否启用，不记录筛选值。
- 所有数据库读写及接口响应保持不变。

### 验证结果

- 使用工作区提供的 Node.js 运行项目基线检查：通过；覆盖 19 个独立 JavaScript 文件、17 个 HTML 文件、30 段内联脚本和 88 个本地资源引用。
- `node --check cloudfunctions/saveExperimentRecord/index.js`：通过。
- `node --check cloudfunctions/getExperimentRecords/index.js`：通过。
- 使用内存 CloudBase 模拟对象调用 `saveExperimentRecord.main()`：有效记录的写入文档和 `{ ok, inserted, skipped, ids }` 返回结构保持不变；无效记录继续计入 `skipped`，日志不包含学号或 `clientRecordId`。
- 使用内存 CloudBase 模拟对象调用 `getExperimentRecords.main()`：数据库仍收到原始学号和班级条件，查询返回结构保持不变；日志不包含具体筛选值。
- 定向检索确认原始无效记录标识日志和完整查询条件日志已移除。
- `git diff --check`：通过；仅出现仓库现有的 LF/CRLF 转换提示，无新增空白错误。
- 未连接真实 CloudBase 数据库；本次测试没有读取或写入线上学生实验数据。

### 回滚方式

恢复原日志对象即可；不涉及数据库或学生实验数据回滚。

---

## 2026-07-28｜任务 005：移除学生导入结果中的原始异常对象

### 目标

在保留学生导入成功、跳过和失败反馈的前提下，停止通过 `createStudents` 接口把数据库或运行时原始异常对象返回给浏览器。

### 影响范围

- `createStudents` 单条导入失败结果。
- 不修改成功、跳过或失败判断。
- 不修改 `status`、`studentId`、`name`、`class`、`group`、`reason` 或 `code`。
- 不修改学生账号字段、默认密码规则、数据库写入或教师页面导入流程。

### 修改文件

- `cloudfunctions/createStudents/index.js`
- `docs/HARDENING_CHANGELOG.md`
- `docs/HARDENING_GUARDRAILS.md`

### 修改原因

原实现会枚举并序列化异常对象的全部自有属性，然后把它作为单条失败结果的 `error` 字段返回。底层 SDK 异常可能包含堆栈、内部请求信息或环境细节。当前教师导入页只使用 `status`、`reason`、`message` 和展示字段，不读取该原始 `error` 字段。

### 行为影响

- 单条失败结果继续返回可展示的 `reason` 和可诊断的 `code`。
- 删除未被当前调用方使用的原始 `error` 字段。
- 删除因此失去用途的 `serializeError()` 辅助函数。
- 导入计数、数据库读写和整体返回结构保持不变。

### 验证结果

- 使用工作区提供的 Node.js 运行项目基线检查：通过；覆盖 19 个独立 JavaScript 文件、17 个 HTML 文件、30 段内联脚本和 88 个本地资源引用。
- `node --check cloudfunctions/createStudents/index.js`：通过。
- 全部调用方检索未发现教师页面或其他脚本读取单条结果的 `error` 字段。
- 使用内存 CloudBase 模拟对象执行导入，覆盖成功、重复跳过、数据库失败和缺少字段四条路径：成功/跳过/失败计数保持不变。
- 模拟验证默认密码生成、学生文档写入以及失败结果的 `reason`、`code` 保持不变。
- 在模拟异常中加入测试敏感属性，最终响应未包含该属性，也不再包含 `error` 字段。
- `git diff --check`：通过；仅出现仓库现有的 LF/CRLF 转换提示，无新增空白错误。
- 未连接真实 CloudBase 数据库；本次测试没有创建或修改线上学生账号。

### 回滚方式

恢复 `serializeError()` 和单条失败结果的 `error` 字段即可；不涉及数据库或学生账号数据回滚。

---

## 2026-07-28｜任务 006：最小化学生端实验上传日志

### 目标

在不改变共享实验上传器的请求、身份附加、去重标识、返回值或失败兜底的前提下，停止在浏览器控制台输出云函数完整响应和原始网络异常。

### 影响范围

- `assets/experiment-uploader.js` 中上传成功、接口失败和网络异常三类日志。
- 不修改上传请求体、接口地址、localStorage 读取、游客判断或返回结果。
- 不修改任何实验页面。

### 修改文件

- `assets/experiment-uploader.js`
- `docs/HARDENING_CHANGELOG.md`
- `docs/HARDENING_GUARDRAILS.md`

### 修改原因

上传成功日志原样输出包含记录 ID 的完整响应；失败日志输出完整服务端响应；异常日志输出原始异常对象。共享上传器被多个实验页面和 AI 对话记录复用，这些日志会在所有学生端入口重复暴露诊断细节。

### 行为影响

- 成功日志只保留写入和跳过数量。
- 接口失败日志只保留 HTTP 状态和稳定错误码。
- 网络异常日志只保留异常类型名称。
- `uploadExperimentRecords()` 的所有返回值保持不变，调用方仍能按原方式处理结果。

### 遗留风险

`strategies.html` 仍有一处页面级代码自行打印完整上传结果。该文件在本轮开始前已有用户未提交修改，且直接参与学生实验流程，因此本任务不触碰；应在合并现有页面修改并完成策略实验回归后单独清理。

### 验证结果

- 使用工作区提供的 Node.js 运行项目基线检查：通过；覆盖 19 个独立 JavaScript 文件、17 个 HTML 文件、30 段内联脚本和 88 个本地资源引用。
- `node --check assets/experiment-uploader.js`：通过。
- 使用模拟 localStorage、fetch 和 console 执行成功、接口失败、网络异常及游客模式四条路径：函数返回值保持不变。
- 模拟验证非游客上传请求仍附加学生身份字段和 `clientRecordId`，请求结构保持不变。
- 成功日志未包含记录 ID 或学生标识；失败日志未包含完整服务端响应；网络异常日志未包含异常正文。
- 全部调用方检索确认控制台日志结果不参与页面控制或上传判断。
- `git diff --check`：通过；仅出现仓库现有的 LF/CRLF 转换提示，无新增空白错误。
- 未发出真实网络请求，也未上传或修改线上学生实验数据。

### 回滚方式

恢复原三处日志参数即可；不涉及数据库或学生实验数据回滚。

---

## 2026-07-28｜任务 007：最小化前端登录与导入异常诊断

### 目标

在不改变学生登录和教师导入控制流的前提下，停止把原始异常对象写入控制台或完整渲染到教师导入页面。

### 影响范围

- 学生登录请求异常时的控制台日志。
- 教师导入页检查登录状态和导入失败时的控制台日志。
- 教师导入页“错误详情”区域的诊断内容。
- 不修改学生看到的登录错误提示、登录请求、会话写入、跳转或按钮恢复。
- 不修改教师登录判断、Excel 解析、云函数调用、HTTP 回退或导入结果。

### 修改文件

- `login.html`
- `admin/initStudents.html`
- `docs/HARDENING_CHANGELOG.md`
- `docs/HARDENING_GUARDRAILS.md`

### 修改原因

学生登录页和教师导入页会直接输出原始异常对象。教师导入页还会把 `raw`、完整异常和诊断对象渲染在页面错误详情中，可能暴露请求内容、SDK 内部信息、堆栈或登录态诊断数据。

### 行为影响

- 控制台错误日志只保留上下文、异常类型和错误码。
- 教师页面错误详情继续显示上下文、调用目标、错误来源、用户提示和错误码。
- 页面不再显示 `cloudFunctionRaw`、完整异常对象或诊断对象。
- 所有登录和导入分支、返回处理及用户提示保持不变。

### 验证结果

- 使用工作区提供的 Node.js 运行项目基线检查：通过；覆盖 19 个独立 JavaScript 文件、17 个 HTML 文件、30 段内联脚本和 88 个本地资源引用。
- 使用模拟 DOM、localStorage 和 fetch 执行学生登录成功、服务端拒绝和网络异常路径：登录请求体、会话写入、跳转、错误提示及按钮恢复行为保持不变。
- 模拟网络异常日志包含异常类型和错误码，但不包含测试异常正文。
- 使用模拟教师导入 DOM 执行错误详情格式化：页面仍显示上下文、用户提示和错误码，不再包含注入的原始响应、登录态诊断或堆栈。
- 模拟教师导入错误日志包含上下文和错误码，但不包含用户提示正文或原始异常属性。
- 定向检索确认两份页面不再存在 `console.error(error)`，教师错误详情不再包含 `cloudFunctionRaw` 或“完整 error 对象”。
- `git diff --check`：通过；仅出现仓库现有的 LF/CRLF 转换提示，无新增空白错误。
- 未调用真实学生登录接口、CloudBase 或学生导入云函数。

### 回滚方式

恢复原控制台参数和错误详情字段即可；不涉及会话、数据库、学生账号或实验数据回滚。

---

## 2026-07-28｜任务 008：最小化 AI 助手诊断日志

### 目标

在不改变 AI 请求、回答处理、对话记录、报告提交或用户错误提示的前提下，停止在浏览器控制台输出学生身份、页面路径、接口地址、完整后端响应和原始异常。

### 影响范围

- 实际被实验页面引用的 `assets/ai-assistant.js`。
- localStorage 解析、AI 对话记录上传、AI 请求、响应解析和后端错误日志。
- 不修改请求体、对话存储、上传记录、回答选择或抛给页面的错误信息。
- 不修改任何实验页面。

### 修改文件

- `assets/ai-assistant.js`
- `docs/HARDENING_CHANGELOG.md`
- `docs/HARDENING_GUARDRAILS.md`

### 修改原因

当前有效 AI 助手脚本会在不同路径输出学生 ID、页面路径、AI 接口地址、后端完整错误响应和原始异常对象。AI 助手跨多个实验页面复用，日志可能同时暴露学生身份、实验上下文和服务端诊断信息。

### 行为影响

- localStorage 解析失败日志只保留存储键名和异常类型。
- AI 对话上传日志只保留来源模块和对话条数。
- AI 请求日志只保留实验名称、当前步骤和是否包含问题。
- 网络、解析和后端错误日志只保留异常类型、HTTP 状态或稳定错误码。
- AI 请求体、返回回答、用户错误提示和上传返回值保持不变。

### 历史版本

根目录 `ai-assistant.js` 与当前脚本内容不同，但仓库页面没有引用它。本任务不删除或修改该历史文件；后续应在独立的遗留文件清理任务中结合部署清单确认是否可删除。

### 验证结果

- 使用工作区提供的 Node.js 运行项目基线检查：通过；覆盖 19 个独立 JavaScript 文件、17 个 HTML 文件、30 段内联脚本和 88 个本地资源引用。
- `node --check assets/ai-assistant.js`：通过。
- 页面引用检索确认六个实验/筛查页面使用 `assets/ai-assistant.js`，根目录历史版本没有页面引用。
- 使用模拟浏览器对象和 fetch 执行 AI 请求成功、后端失败及网络异常路径：请求地址、请求体、回答和用户错误提示保持不变。
- 使用模拟 localStorage 和上传器提交 AI 对话记录：学生身份、问题、回答及 `clientRecordId` 仍按原结构进入上传载荷，上传返回值保持不变。
- 捕获日志未包含测试学生 ID、问题、回答、页面路径、接口令牌、后端完整响应或网络异常正文。
- localStorage 损坏路径继续回退到默认值，日志只包含键名和异常类型。
- `git diff --check`：通过；仅出现仓库现有的 LF/CRLF 转换提示，无新增空白错误。
- 未调用真实 AI 接口、CloudBase 或实验记录上传接口。

### 回滚方式

恢复原日志参数即可；不涉及 localStorage、AI 对话记录、数据库或学生实验数据回滚。

---

## 2026-07-28｜任务 009：最小化语音助手异常日志

### 目标

在不改变麦克风准备、WebSocket 连接、转写展示和用户错误提示的前提下，停止在浏览器控制台输出 ASR 事件、错误正文和原始异常对象。

### 影响范围

- 六个实验/筛查页面共同引用的 `assets/voice-assistant.js`。
- ASR 回调错误和启动录音失败两类日志。
- 不修改 `assets/voice-recorder.js` 或 `assets/asr-client.js`；审查确认二者当前没有控制台日志。
- 不修改录音、音频发送、转写文本、复制或清空行为。

### 修改文件

- `assets/voice-assistant.js`
- `docs/HARDENING_CHANGELOG.md`
- `docs/HARDENING_GUARDRAILS.md`

### 修改原因

语音助手会把 ASR 错误消息及事件对象、启动失败的原始异常对象直接输出到浏览器控制台。浏览器事件和异常可能包含连接信息或运行时诊断细节，且这些对象不参与后续控制流。

### 行为影响

- 两类错误日志只保留异常类型名称。
- ASR 提供的错误消息仍按原逻辑显示给用户。
- 启动失败的错误消息仍按原逻辑显示给用户。
- 录音停止、按钮状态和识别状态恢复保持不变。

### 验证结果

- 使用工作区提供的 Node.js 运行项目基线检查：通过；覆盖 19 个独立 JavaScript 文件、17 个 HTML 文件、30 段内联脚本和 88 个本地资源引用。
- `node --check assets/voice-assistant.js`、`voice-recorder.js` 和 `asr-client.js`：通过。
- 页面引用检索确认六个实验/筛查页面按相同顺序加载录音器、ASR 客户端和语音助手。
- 使用模拟 DOM、录音器和 ASR 客户端执行 ASR 错误、最终转写和启动失败路径。
- ASR 错误及启动失败的用户提示保持不变，最终转写仍写入文本框。
- 启动失败后仍调用录音器/ASR 停止逻辑，并恢复开始、停止按钮状态。
- 捕获日志只包含异常类型，不包含测试 ASR 消息、事件属性、启动错误正文或转写文本。
- 定向检索确认 `voice-recorder.js` 和 `asr-client.js` 当前没有控制台日志。
- `git diff --check`：通过；仅出现仓库现有的 LF/CRLF 转换提示，无新增空白错误。
- 未请求真实麦克风权限，未建立真实 WebSocket，也未发送音频。

### 回滚方式

恢复两处日志参数即可；不涉及音频、转写文本、数据库或学生实验数据回滚。

---

## 2026-07-28｜任务 010：停止向浏览器透传 AI 上游错误

### 目标

在不改变 AI 请求内容、模型参数、成功回答和现有 HTTP 状态的前提下，停止把 DeepSeek 响应正文或运行时异常正文返回给浏览器。

### 影响范围

- Vercel AI 代理 `api/chat.js` 的上游非成功响应和运行时异常响应。
- 不修改请求验证、学生上下文构建、API Key 请求头、模型参数或成功 `{ reply }` 响应。
- 不修改前端 AI 助手。

### 修改文件

- `api/chat.js`
- `docs/HARDENING_CHANGELOG.md`
- `docs/HARDENING_GUARDRAILS.md`

### 修改原因

原实现会读取 DeepSeek 完整错误正文，将其中的错误消息或原始文本截断后返回浏览器；网络、JSON 解析等异常也会把 `error.message` 返回。上游错误可能包含请求标识、供应商内部信息、模型路由或其他不应暴露给学生端的诊断细节。

### 行为影响

- DeepSeek 非成功响应继续返回 HTTP 502，并保留上游 HTTP 状态的概括性提示。
- 网络、响应解析及其他运行时异常继续返回 HTTP 500，但只提供稳定通用提示。
- 不再读取或返回 DeepSeek 错误响应正文。
- 成功回答、输入错误、请求方法错误及缺少环境变量的现有行为保持不变。

### 验证结果

- 使用工作区提供的 Node.js 运行项目基线检查：通过；覆盖 19 个独立 JavaScript 文件、17 个 HTML 文件、30 段内联脚本和 88 个本地资源引用。
- `node --check api/chat.js`：通过。
- 使用模拟 Vercel 请求/响应和 fetch 执行成功、上游 HTTP 失败、网络异常、响应解析异常、错误请求方法、空问题及缺少环境变量路径。
- 成功路径的 DeepSeek 地址、Authorization、模型名、学生上下文、问题和 `{ reply }` 响应保持不变。
- 上游 HTTP 429 继续对客户端返回 HTTP 502；模拟上游错误正文没有被读取，响应只包含概括性状态提示。
- 网络和响应解析异常继续返回 HTTP 500，注入的异常秘密没有进入客户端响应。
- 请求方法、问题必填和环境变量检查的现有状态码及提示保持不变。
- 定向检索确认不再存在 `response.text()`、`readDeepSeekError()` 或异常消息拼接。
- `git diff --check`：通过；仅出现仓库现有的 LF/CRLF 转换提示，无新增空白错误。
- 未调用真实 DeepSeek 接口，测试使用临时模拟 API Key。

### 回滚方式

恢复上游错误正文解析和异常消息拼接即可；不涉及密钥、AI 对话记录、数据库或学生实验数据回滚。

---

## 2026-07-28｜任务 011：加固本地静态服务器路径边界

### 目标

在保持正常本地页面和资源访问行为不变的前提下，修复本地开发服务器的目录边界判断，并让畸形 URL 安全返回拒绝结果。

### 影响范围

- `local-static-server.js` 的请求 URL 解码和文件路径解析。
- 不修改端口、根路径到 `login.html` 的映射、GET/HEAD 限制、MIME、缓存或文件流。
- 不影响 GitHub Pages、CloudBase、AI 后端或线上学生实验。

### 修改文件

- `local-static-server.js`
- `docs/HARDENING_CHANGELOG.md`
- `docs/HARDENING_GUARDRAILS.md`

### 修改原因

原实现使用 `filePath.startsWith(ROOT)` 判断目标是否位于仓库内。同名前缀的相邻目录路径也可能满足字符串前缀条件，不能可靠表示文件系统父子关系。此外，畸形百分号编码会让 `decodeURIComponent()` 抛错，可能中断本地服务请求处理。

### 行为影响

- 改用 `path.relative()` 判断目标是否真正位于仓库根目录之下。
- 拒绝父目录、绝对相对结果和解析后等于仓库根目录的目标。
- URL 构造或解码失败时返回拒绝结果，由现有处理逻辑响应 HTTP 403。
- 正常首页、HTML、脚本、样式和资源路径保持不变。

### 验证结果

- 使用工作区提供的 Node.js 运行项目基线检查：通过；覆盖 19 个独立 JavaScript 文件、17 个 HTML 文件、30 段内联脚本和 88 个本地资源引用。
- `node --check local-static-server.js`：通过。
- 以内存方式加载服务器处理函数，没有启动监听端口。
- 正常 `GET /package.json`、`HEAD /package.json` 和 `GET /`：均保持 HTTP 200；首页仍映射到 `login.html`，HEAD 仍不返回正文。
- 缺失文件继续返回 HTTP 404，POST 请求继续返回 HTTP 405。
- 父目录、同名前缀相邻目录、编码反斜杠路径和解析后仓库根目录目标均被拒绝。
- 畸形百分号编码不再抛出到请求处理之外，而是由现有逻辑返回 HTTP 403。
- 定向检索确认不再使用 `filePath.startsWith(ROOT)`。
- `git diff --check`：通过；仅出现仓库现有的 LF/CRLF 转换提示，无新增空白错误。

### 回滚方式

恢复原 `startsWith(ROOT)` 判断即可；不涉及部署、数据库或学生实验数据回滚。

---

## 2026-07-28｜任务 012：安全止血阶段最终扫描与验收

### 目标

一次性完成安全止血阶段的剩余信息暴露收口：停止记录或显示 ASR 签名信息、CloudBase/数据库原始错误、完整上传结果和教师端原始诊断响应，同时保持现有登录、导入、查询、AI、语音和实验记录上传调用不变。

### 影响范围

- ASR 签名服务的成功与失败日志。
- 教师后台登录检查、实验记录读取和导入学生时的错误诊断。
- 四个 CloudBase 云函数在数据库 SDK 返回结果码时的客户端错误信息。
- 五个实验页面在 AI 对话或实验记录上传完成后的控制台输出。
- 不修改学生实验步骤、计时、评分、材料、报告、localStorage key、数据库字段或上传载荷。
- 不进入教师认证、密码迁移、数据库权限规则和实验数据结构调整。

### 修改文件

- `app.js`
- `admin/dashboard.html`
- `admin/initStudents.html`
- `cloudfunctions/studentLogin/index.js`
- `cloudfunctions/getExperimentRecords/index.js`
- `cloudfunctions/createStudents/index.js`
- `cloudfunctions/saveExperimentRecord/index.js`
- `memory.html`
- `nback.html`
- `interference.html`
- `poster.html`
- `strategies.html`
- `docs/HARDENING_CHANGELOG.md`
- `docs/HARDENING_GUARDRAILS.md`

其中五个实验页面在本阶段开始前已有用户未提交修改；本任务只删除上传 Promise 的完整结果日志，没有覆盖、格式化或调整其余内容。

### 修改原因

- ASR 成功日志曾携带可关联单次签名请求的 `voiceId`，失败日志曾输出异常正文。
- 教师后台仍有直接输出原始异常对象、CloudBase 登录状态诊断及 HTTP 网关原始响应的历史调试链。
- 云函数在 SDK 返回 `code` 时仍可能把供应商 `message` 直接返回浏览器。
- 多个实验页面会把共享上传器的完整返回对象再次打印，可能包含记录 ID 或后续扩展出的敏感字段。
- 这些代码均属于多轮排错后保留的诊断实现，不参与业务控制流，适合在不改变功能的前提下先行止血。

### 行为影响

- ASR 成功响应仍为 `{ wsUrl }`，但成功日志只说明签名已创建；失败日志只保留异常类型。
- 教师后台错误日志只保留稳定的异常类型、错误码和必要能力布尔值；页面不再显示 SDK、HTTP 网关或云函数原始响应正文。
- 云函数仍保留原有 `ok`、`code`、`records`、统计结果和 HTTP 行为，但数据库失败说明改为稳定文本。
- 五个实验页面仍调用 `submitAiChatRecord()` 和 `uploadExperimentRecords()`；只移除不参与后续逻辑的 `.then(console...)`。
- 学生实验执行与数据上传调用没有改变，因此未触发暂停条件。

### 验证结果

- 使用工作区 Node.js v24.14.0 运行项目基线检查：通过；覆盖 19 个独立 JavaScript 文件、17 个 HTML 文件、30 段内联脚本和 88 个本地资源引用。
- 对本阶段相关独立 JavaScript 文件执行 `node --check`：全部通过。
- 模拟四个云函数的 CloudBase SDK 结果码失败，并注入测试秘密正文；客户端结果和抛出信息均未包含该正文。
- 模拟 ASR 签名 GET 请求：继续返回 HTTP 200 和唯一 `wsUrl` 字段；捕获日志不包含完整 WebSocket 地址、签名、SecretId 或 SecretKey。
- 静态验证五个实验页面仍保留 AI 对话上传调用，`strategies.html` 仍保留实验记录上传调用，且页面不再包含完整 AI 上传结果日志。
- 定向检查教师后台：四处 dashboard 异常日志均经过 `getErrorSummary()`；导入页不再保存或显示 `error.raw`、HTTP 原始正文或 CloudBase 原始异常正文。
- 全仓定向扫描未发现新增硬编码密钥；剩余命中为稳定错误码、聚合计数、能力布尔值或环境变量名称，不包含密钥值、学生身份、完整记录、签名或原始异常对象。
- `git diff --check`：通过；仅出现仓库现有的 LF/CRLF 转换提示，无新增空白错误。
- 未连接真实 CloudBase、数据库、DeepSeek 或腾讯 ASR；真实权限与部署环境回归留待相应核心安全任务。

### 阶段结论

安全止血阶段（任务 002—012）完成。此结论表示已收口当前可安全处理的信息泄露、原始错误透传、过量诊断日志和本地路径边界问题，不表示平台已经完成身份认证与授权加固。

下一阶段仍必须处理的核心风险：

1. 教师后台临时免登录和现有匿名 HTTP fallback。
2. 敏感云函数缺少服务端角色授权及数据范围校验。
3. 学生身份由客户端 localStorage 和上传字段提供，服务端可被伪造。
4. 学生密码仍为明文和可推导默认值，需要兼容迁移方案。
5. CloudBase、Node.js 与部署运行时版本不一致，尚未完成真实环境回归。

### 回滚方式

本任务均为日志、诊断和失败提示收口；可按单文件恢复对应日志或错误文本。无需回滚数据库或学生实验数据。

---

## 2026-07-28｜任务 013：阶段 2——统一身份、配置和数据契约

### 目标

在不迁移历史数据、不改变学生实验步骤和不更换现有 localStorage key 的前提下，为浏览器端建立唯一的身份、接口配置和实验记录契约，并让新写入的学生会话与实验记录具有明确版本。

### 影响范围

- 学生登录、游客入口、身份展示与退出。
- 五个实验页面、前测页和首页的公共脚本加载及存储 key 来源。
- 实验记录上传、AI 助手身份读取和报告身份读取。
- 教师后台 CloudBase 环境、HTTP 接口和实验存储 key 来源。
- 学生登录、学生导入、实验记录保存和记录查询云函数的环境或版本契约。
- 不修改实验步骤、材料、计时、评分、报告生成逻辑和历史记录内容。
- 不执行数据库迁移、批量回填、删除或重命名字段。

### 修改文件

新增：

- `assets/platform-core.js`
- `scripts/check-platform-contracts.js`
- `scripts/check-platform-integration.js`
- `docs/PLATFORM_CONTRACTS.md`

接入或调整：

- `auth.js`
- `cloudbase.js`
- `login.html`
- `index.html`
- `pretest.html`
- `memory.html`
- `nback.html`
- `interference.html`
- `strategies.html`
- `poster.html`
- `review.html`
- `assets/experiment-uploader.js`
- `assets/ai-assistant.js`
- `assets/review.js`
- `admin/dashboard.html`
- `admin/initStudents.html`
- `cloudfunctions/studentLogin/index.js`
- `cloudfunctions/createStudents/index.js`
- `cloudfunctions/getExperimentRecords/index.js`
- `cloudfunctions/saveExperimentRecord/index.js`
- `package.json`
- `docs/HARDENING_CHANGELOG.md`
- `docs/HARDENING_GUARDRAILS.md`

`index.html` 和五个实验页面在本阶段开始前已有用户未提交修改；本任务只增加公共核心加载并把原有常量指向公共配置，没有格式化或覆盖其余内容。

### 修改原因

- 学生本地会话、CloudBase Auth、登录页、上传器、AI 助手和报告页分别实现身份读取，字段别名和损坏数据处理不一致。
- CloudBase 环境 ID、HTTP 接口地址、AI 地址和存储 key 散落在多个文件中。
- 前端与云函数分别维护实验模块、记录类型和身份补齐逻辑，新记录没有版本标识。
- 这些历史并行实现会让环境切换、身份字段调整和新增实验需要跨页面同步修改。

### 统一结果

- `window.BrainPlatform.config` 成为浏览器环境、接口地址和公共存储 key 的唯一来源。
- `window.BrainPlatform.identity` 统一读取、规范化、写入和清除 `studentSession`。
- 继续兼容 `studentName/className/groupName/groupId` 等历史身份别名。
- `window.BrainPlatform.records` 统一身份补齐、`clientRecordId` 和上传信封构造。
- 学生会话规范为 `schemaVersion: 1`，角色为 `student` 或 `guest`。
- 新实验记录上传信封、数据库顶层文档和 `data` 均写入 `schemaVersion: 1`。
- 历史无版本会话和实验记录按 v1 读取，不执行批量改写。
- CloudBase 云函数使用 `SYMBOL_CURRENT_ENV`，部署环境继续由 `cloudbase.json` 决定。
- 明确区分浏览器学生会话、教师 CloudBase 调用通道和服务端授权；本阶段没有把客户端 `role` 当作授权依据。

### 行为兼容

- `studentSession` key 及 `studentId/name/class/group/mustChangePassword` 字段保持可用。
- 游客仍可进入实验、生成报告且不上传后台。
- 原 `clientRecordId` 生成字段和顺序保持不变。
- 上传接口地址、请求方法、模块、记录类型、学生字段和云函数成功响应保持不变。
- 登录成功后仍写入会话并跳转原目标；损坏会话现在会被清理而不是误判为已登录。
- 明确声明不支持的实验记录版本由保存云函数拒绝；未声明版本的旧客户端仍按 v1 接受。

### 验证结果

- 直接使用工作区 Node.js 执行 `check-platform-contracts.js` 和 `check-platform-integration.js`：验证旧学生会话、字段别名、游客会话、损坏会话、身份字段、上传信封、稳定 `clientRecordId`、页面脚本顺序、游客跳过上传、云函数 v1 写入和不支持版本拒绝。项目同时提供 `npm run check:contracts` 作为标准入口；当前工作区未提供 npm 可执行文件。
- 项目基线检查通过：覆盖 22 个独立 JavaScript 文件、17 个 HTML 文件、30 段内联脚本和 99 个本地资源引用。
- 阶段相关独立 JavaScript 文件全部通过 `node --check`。
- 定向扫描确认运行页面不再重复硬编码 CloudBase HTTP 地址、AI 地址或 `studentSession` 直接读写。
- 云函数模拟确认使用当前部署环境，学生登录响应包含 v1 身份契约，实验记录顶层及 `data` 均写入 v1。
- `git diff --check` 通过；仅有仓库现有 LF/CRLF 转换提示。
- 未连接真实 CloudBase 或修改真实数据库；部署环境、权限规则和历史生产数据仍需在核心授权或部署阶段验证。

### 回滚方式

先恢复页面和公共调用方的原常量与身份/上传实现，再删除 `assets/platform-core.js` 及契约检查脚本。已写入的 `schemaVersion`、`role` 为附加字段，旧代码会忽略；不需要删除或迁移历史数据。

---

## 2026-07-28｜任务 014：阶段 3——新数据库模型与可靠上传

### 目标

在不修改实验页面提交逻辑、不迁移历史数据和不中断 v1 客户端的前提下，把新实验记录规范写入数据库模型 v2，并为浏览器上传增加请求前落盘、失败重试、跨学生隔离和响应丢失幂等恢复。

### 影响范围

- `experimentRecords` 新写入文档的结构与文档 ID。
- 共享实验上传器的发送前落盘、失败处理和重试行为。
- 实验记录契约从 v1 升级为 v2；学生身份契约继续保持 v1。
- 保存云函数的批量结果从仅汇总扩展为逐条状态。
- 不修改五个实验页面、前测页或 AI 助手的调用方式。
- 不迁移、删除、回填或远程修改历史数据库记录与索引。

### 修改文件

- `assets/platform-core.js`
- `assets/experiment-uploader.js`
- `cloudfunctions/saveExperimentRecord/index.js`
- `scripts/check-platform-contracts.js`
- `scripts/check-platform-integration.js`
- `docs/PLATFORM_CONTRACTS.md`
- `docs/DATABASE_MODEL_V2.md`
- `docs/HARDENING_CHANGELOG.md`
- `docs/HARDENING_GUARDRAILS.md`

### 数据库模型 v2

- 新文档使用 `schemaVersion: 2`。
- 新增 `recordId`、`sourceSchemaVersion`、`owner`、`activity`、`timestamps` 和 `payload`。
- 继续保留 `module`、`recordType`、学生身份字段、`data`、`clientRecordId`、`createdAt` 和 `uploadedAt`，教师后台可继续读取。
- 无版本或 v1 上传继续接受，并以 `sourceSchemaVersion: 1` 规范写入 v2。
- 历史无版本/v1 文档保持原样。

### 幂等与逐条结果

- 服务端对完整 `clientRecordId` 计算 SHA-256，以 `record_<hash>` 作为确定性 CloudBase 文档 ID。
- 并发请求或响应丢失后的重试最终写入同一文档。
- 写入前继续按 `clientRecordId` 查询，用于识别历史记录并返回 `duplicate`。
- 批量写入逐条返回 `stored`、`duplicate`、`skipped` 或 `failed`，以及稳定错误码和是否可重试。
- 单条数据库失败不会中止其余记录。

### 可靠上传

- 新 localStorage key：`experiment-upload-outbox-v1`。
- 每条记录在发起 fetch 前进入 outbox，页面立即跳转时仍保留待上传副本。
- outbox 按学生 ID 分区，只重试当前学生的记录。
- 游客记录仍不上传，也不进入 outbox。
- 页面加载和浏览器恢复联网时自动重试。
- 重试使用指数退避，最长五分钟。
- 待上传记录最多 200 条，保留七天；过期记录在读取时清理。
- 成功或确认重复后移除；网络、408、429、5xx、临时数据库失败及滚动部署版本不匹配继续保留。
- 明确无效的数据和不可重试错误从队列移除并通过返回结果报告。

### 行为兼容

- `window.uploadExperimentRecords()` 的名称和调用参数保持不变。
- 原模块、记录类型、身份字段、`clientRecordId` 算法和接口地址保持不变。
- v1 客户端可以先于前端继续调用新云函数。
- v2 静态资源误先部署时，旧云函数的版本拒绝会让记录留在 outbox，升级云函数后继续重试。
- 教师后台继续通过 v1 兼容字段查询和导出 v2 文档。

### 验证结果

- 旧学生会话继续规范为身份 v1，新上传信封和记录规范为 v2。
- 模拟在线成功：请求前入队，服务端确认后清空。
- 模拟离线：记录保留、尝试次数增加，恢复联网后成功移除。
- 模拟共享设备切换学生：另一学生不能发送或删除原学生队列。
- 模拟游客：不发送请求且不进入队列。
- 模拟前端先于云函数部署：`UNSUPPORTED_SCHEMA_VERSION` 记录保留，兼容云函数上线后恢复。
- 模拟 v1、v2 和未知版本载荷：v1/v2 写成 v2，未知版本稳定拒绝。
- 模拟重复提交：第二次返回 `duplicate`，数据库文档数量不增加。
- 模拟服务端已写入但响应丢失：队列保留，重试确认重复后移除，数据库仍只有一份。
- 模拟两条批量记录中一条数据库失败：成功记录照常写入，失败记录返回可重试逐条状态。
- 模拟教师端读取历史无版本记录：记录保持原对象和原字段。
- 项目基线、相关 JS 语法和 `git diff --check` 均通过。
- 未连接真实 CloudBase；文档 ID 写入、索引和 HTTP 部署顺序仍需在真实测试环境验证。

### 部署与回滚

部署必须先更新 `saveExperimentRecord` 云函数，再发布静态资源。回滚必须先回滚静态资源，再回滚云函数。v2 文档保留 v1 兼容字段，回滚前端后无需删除已写入记录。

---

## 2026-07-28｜任务 015：阶段 4——抽离公共模块与实验注册表

### 目标

在不改变实验步骤、计时、评分、状态结构和上传数据格式的前提下，统一实验 ID、名称、路由、报告元数据和 localStorage key，并抽离六个页面重复的完整状态提交与五个页面重复的报告收尾逻辑。

### 影响范围

- 新增只读实验注册表和页面公共桥接。
- 首页入口从注册表读取页面路由。
- 报告页从注册表读取报告元数据与状态 key。
- 教师后台从注册表生成模块筛选项并读取通用显示名称。
- 五个实验页和资格审查页保留原提交函数名，内部改为调用公共桥接。
- 不修改实验状态机、题目、刺激材料、计时、随机化、评分、过程记录、报告计算、云函数逻辑或数据库结构。

### 修改文件

- `assets/experiment-registry.js`
- `assets/experiment-bridge.js`
- `assets/platform-core.js`
- `assets/review.js`
- `index.html`
- `login.html`
- `review.html`
- `pretest.html`
- `memory.html`
- `nback.html`
- `interference.html`
- `strategies.html`
- `poster.html`
- `admin/dashboard.html`
- `admin/initStudents.html`
- `scripts/check-experiment-registry.js`
- `scripts/check-platform-contracts.js`
- `scripts/check-platform-integration.js`
- `package.json`
- `docs/PLATFORM_CONTRACTS.md`
- `docs/EXPERIMENT_REGISTRY.md`
- `docs/HARDENING_CHANGELOG.md`
- `docs/HARDENING_GUARDRAILS.md`

### 行为兼容

- 原页面 `submit*Record()` 函数名和所有既有调用点保持不变。
- 完整状态提交仍使用 `recordType: "submission"`，身份字段、`fullState`、`createdAt` 和 `clientRecordId` 格式保持不变。
- 需要同步思考字段的四个实验仍在快照前同步；海报和资格审查保持各自原快照方式。
- 生成报告仍按“保存状态 → 提交完整状态 → 提交 AI 对话记录 → 新窗口打开报告”的顺序执行。
- localStorage key、模块 ID、页面 URL、报告类型及教师后台模块顺序保持不变。
- 实验特有过程上传（例如策略实验尝试记录）未纳入公共桥接，也未修改。

### 验证结果

- 新注册表检查验证 7 个模块 ID、5 个实验路由、5 个状态 key 均唯一。
- 验证注册表模块集合与保存云函数允许模块集合完全一致。
- 验证公共核心的模块集合、前测 key、AI 对话 key 和五个实验状态 key 均从注册表派生。
- 模拟完整状态提交，验证快照前同步、深拷贝、身份字段、提交动作、时间和 `clientRecordId` 与原格式一致。
- 模拟报告收尾，验证 AI 对话记录先于报告窗口打开，报告 URL 与原格式一致。
- 验证 11 个页面的注册表/公共核心顺序及 6 个提交页面的上传器/桥接顺序。
- 平台契约、可靠上传、云函数兼容与数据库 v2 集成测试通过。
- 项目基线通过：25 个 JavaScript 文件、17 个 HTML 文件、30 段内联脚本和 115 个本地资源引用。
- 本地浏览器冒烟检查通过：首页 6 个入口 ID 正确，记忆报告使用注册表元数据完成渲染，教师后台生成 7 个模块选项和 5 个 AI 来源选项，三个页面均无控制台错误。
- `git diff --check` 通过；仅有仓库现有 LF/CRLF 转换提示。
- 未进行真实浏览器人工实验或真实 CloudBase 上传；上线前仍需按五个实验和资格审查逐页验收。

### 部署与回滚

本阶段没有云函数或数据库变更，只需发布完整静态站点，不能只上传单个页面或单个公共脚本。回滚时应把本任务列出的静态文件作为一组恢复，避免注册表、公共核心和页面加载顺序版本不一致。

---

## 2026-07-28｜任务 016：阶段 5——逐个迁移实验页面

### 目标

在不改变实验状态结构、步骤、计时、评分和学生操作顺序的前提下，将五个实验页重复的状态读取、上下文应用、身份补齐和状态保存迁移到统一页面运行时。

### 影响范围

- 新增实验页面状态生命周期运行时。
- 按海报、记忆容量、干扰、策略、N-back 的顺序迁移五个实验页面。
- 页面继续拥有自己的默认状态、`mergeState()`、历史字段迁移、步骤控制和实验逻辑。
- 不修改资格审查页、首页、报告内容、教师后台、上传器、云函数或数据库。

### 修改文件

- `assets/experiment-page-runtime.js`
- `poster.html`
- `memory.html`
- `interference.html`
- `strategies.html`
- `nback.html`
- `scripts/check-experiment-page-migration.js`
- `package.json`
- `docs/EXPERIMENT_PAGE_MIGRATION.md`
- `docs/EXPERIMENT_REGISTRY.md`
- `docs/PLATFORM_CONTRACTS.md`
- `docs/HARDENING_CHANGELOG.md`
- `docs/HARDENING_GUARDRAILS.md`

### 行为兼容

- 五个页面继续使用原 storage key 和原状态对象。
- 各页面原 `mergeState()` 未移动、未改名、未改变调用参数。
- 探究上下文仍先应用，当前登录身份仍最后覆盖同名身份字段。
- 保存仍按“思考字段同步 → 登录身份补齐 → 写入 `savedAt` → localStorage 落盘”的顺序执行。
- 海报页原本没有思考字段同步，迁移后仍不执行该回调。
- N-back 任一读取或合并异常时仍整体回退默认状态，并保留损坏 key。
- 其他四页仍分别清理损坏的状态或上下文 key，并继续使用可恢复部分。
- 步骤导航、解锁、验证、计时、随机化、评分、实验材料、过程上传和报告生成未修改。

### 验证结果

- 模拟正常历史状态，确认历史字段、默认字段和上下文字段正确合并。
- 验证当前登录身份在上下文之后覆盖学号、姓名、班级和小组名称。
- 模拟损坏状态，确认四页恢复模式删除损坏状态并继续读取有效上下文。
- 模拟损坏上下文，确认四页保留有效实验状态并删除损坏上下文。
- 模拟 N-back 损坏上下文，确认返回默认状态、不补齐身份且不删除原 key。
- 模拟保存，确认保存前同步、身份覆盖、ISO 时间戳和最终 JSON 内容。
- 验证五个页面均绑定正确模块，且页面不再直接解析或写入实验状态 key。
- 注册表、平台契约、可靠上传、数据库 v2 集成和项目基线全部通过。
- 本地浏览器逐页检查通过：海报显示 6 个步骤，其他四个实验显示 8 个步骤；五页均成功渲染且无控制台错误。
- 项目基线覆盖 27 个 JavaScript 文件、17 个 HTML 文件、30 段内联脚本和 120 个本地资源引用。
- 未连接真实 CloudBase，未执行完整学生实验或修改远程数据。

### 部署与回滚

本阶段没有云函数或数据库变更。部署时必须把页面运行时、五个实验页面和阶段 4 公共资源作为同一个静态版本发布。回滚不需要迁移 localStorage 数据，但必须同时恢复五页的运行时引用和状态包装函数。

---

## 2026-07-28｜任务 017：阶段 6——教师后台、报告与 AI 整合

### 目标

在不改变教师查询、报告内容、AI 交互、学生实验流程和导出字段的前提下，统一教师后台、报告页和 AI 对话记录的模块解析、路径识别、记录状态读取与处理器分发。

### 影响范围

- 新增只读展示与数据适配层。
- 报告页使用统一活动解析和原有记忆容量回退。
- AI 对话上传使用统一来源模块解析。
- 教师后台使用统一模块名称、记录状态读取和 Excel 构建器分发。
- 六个带 AI 助手的页面新增整合层脚本引用。
- 不修改 CloudBase 查询、云函数、数据库、AI 请求正文、报告构建内容或实验流程。

### 修改文件

- `assets/experiment-integration.js`
- `assets/review.js`
- `assets/ai-assistant.js`
- `admin/dashboard.html`
- `review.html`
- `pretest.html`
- `memory.html`
- `nback.html`
- `interference.html`
- `strategies.html`
- `poster.html`
- `scripts/check-experiment-integration.js`
- `package.json`
- `docs/EXPERIMENT_INTEGRATION.md`
- `docs/EXPERIMENT_REGISTRY.md`
- `docs/PLATFORM_CONTRACTS.md`
- `docs/HARDENING_CHANGELOG.md`
- `docs/HARDENING_GUARDRAILS.md`

### 行为兼容

- 五种合法报告活动继续使用原构建函数，非法活动继续回退记忆容量报告。
- AI 调用方传入合法来源模块时保持原值、原日志和原 `clientRecordId`。
- AI 来源为空或无效时才按当前注册页面识别，避免生成新的任意模块字符串。
- AI 请求、回答渲染、日志保存和上传顺序未修改。
- 教师后台七个模块的详细 Excel 构建函数、sheet 名称和字段未修改。
- 教师导出从条件判断改为模块分发器，但未知模块仍回退原记忆容量构建器。
- 教师筛选、查询参数、表格展示、CloudBase 请求和临时登录开关未修改。

### 验证结果

- 验证模块名称、页面路径、AI 来源、报告活动和记录 payload/fullState 解析。
- 验证 AI 显式合法来源优先，空来源按页面识别，服务模块不能作为自身来源。
- 验证五种合法报告、资格审查和未知活动的回退规则。
- 验证教师七模块构建器分发和未知模块原有回退。
- 验证报告、教师后台及六个 AI 页面脚本加载顺序。
- 页面迁移、实验注册表、平台契约、可靠上传、数据库 v2 集成和项目基线全部通过。
- 本地浏览器确认记忆实验和资格审查均加载一个 AI 助手且无控制台错误。
- 本地浏览器确认海报报告显示案件 05，未知活动回退案件 01。
- 本地浏览器确认教师后台显示 7 个模块选项和 6 个 AI 来源选项（含“全部”），且无控制台错误。
- 项目基线覆盖 29 个 JavaScript 文件、17 个 HTML 文件、30 段内联脚本和 128 个本地资源引用。
- 未发送 AI 问题、未提交实验记录、未触发 Excel 下载、未修改真实 CloudBase 数据。

### 部署与回滚

本阶段没有云函数或数据库变更。部署时必须把整合层、报告脚本、AI 助手、教师后台及所有新增脚本引用作为同一个静态版本发布。回滚不需要数据迁移，但必须同步恢复这些静态文件。

---

## 2026-07-28｜任务 018：阶段 7——构建、部署、监控与遗留清理

### 目标

建立可重复、可校验、可监控和可回滚的 GitHub Pages 发布流程，清理已确认无引用的低风险历史文件，并为以后所有修改建立强制阅读入口。

### 影响范围

- 新增最小静态发布包构建、发布包校验、线上冒烟和遗留检查。
- 新增 GitHub Pages 构建部署工作流和每小时只读监控。
- Pages 部署源从仓库根目录分支发布迁移为 GitHub Actions artifact。
- 删除无引用旧 AI 脚本及历史页面副本。
- 替换占位 README 和旧部署说明。
- 新增根目录 `修改须知.md`。
- 不修改学生实验逻辑、CloudBase 云函数、数据库、AI 后端或真实环境数据。

### 修改文件

- `.gitignore`
- `.github/workflows/pages.yml`
- `.github/workflows/pages-monitor.yml`
- `package.json`
- `scripts/build-site.js`
- `scripts/check-dist.js`
- `scripts/smoke-deployment.js`
- `scripts/check-legacy.js`
- `scripts/check-workflows.js`
- `README.md`
- `DEPLOY.md`
- `修改须知.md`
- `docs/BUILD_DEPLOY_MONITOR.md`
- `docs/LEGACY_REGISTER.md`
- `docs/HARDENING_CHANGELOG.md`
- `docs/HARDENING_GUARDRAILS.md`

### 删除文件

- 根目录 `ai-assistant.js`：旧版本，无页面引用；当前页面使用 `assets/ai-assistant.js`。
- `脑育智能体/`：旧版七个页面与部署说明，无外部引用且内容落后于根目录当前页面。

删除内容仍存在于 Git 历史，可按阶段 7 前 commit 恢复。

### 构建与发布包

- `npm run build` 清理固定的仓库 `dist/` 后，只复制九个页面、根公共脚本、`assets/` 和 `admin/`。
- 构建生成 `.nojekyll`、`health.json` 和带 SHA-256 的 `deploy-manifest.json`。
- `npm run check:dist` 验证必要文件、禁止目录、HTML 本地引用、健康文件和 manifest 一致性。
- 数据库备份、云函数、API、文档、开发脚本和敏感配置不会进入发布包。

### 部署与监控

- 面向 `main` 的 PR 运行检查、构建和发布包校验，不部署。
- 合并 `main` 或手动触发后使用 GitHub Pages artifact 部署。
- 部署后立即检查健康文件、首页、注册表、平台核心、整合层、报告和教师后台。
- 定时监控每小时第 17 分钟运行同一只读检查。
- 线上监控不登录、不提交、不读取学生数据、不调用 AI、不写 CloudBase。

### 遗留保留

以下项目登记但未清理：

- 教师后台临时免登录。
- 服务端授权与学生数据归属。
- 明文或可推导密码。
- CloudBase Node.js 16.13 运行时。
- `备份/` 数据库导出。
- AI 后端密钥、限流、CORS 和真实环境日志治理。

### 验证结果

- 遗留检查确认旧 AI 脚本和旧页面目录已移除，保留高风险遗留均写入修改须知。
- 本地构建生成 40 个 manifest 文件，发布内容约 9.8 MB。
- 发布包校验通过，共 41 个文件（包含 manifest）。
- GitHub Actions 使用零依赖工作流契约检查，不要求本机额外安装 YAML 解析包。
- 完整契约、五个实验页面迁移、教师/报告/AI 整合、可靠上传、数据库 v2、基线、遗留和工作流契约检查全部通过。
- 使用本地临时 HTTP 服务对 `dist/` 执行只读部署冒烟，健康文件、首页、公共运行时、报告页和教师后台均通过。
- `git diff --check` 通过；仅报告 Windows 工作区既有的 LF/CRLF 转换提示。
- 阶段 7 发布前检查当前线上 `health.json` 返回 HTTP 404，说明新 artifact 尚未部署；这是发布前基线，不是本地构建失败。
- GitHub Pages Actions 和线上部署待 GitHub CLI 安装、认证及 PR 发布后验证。

### 部署前人工设置

GitHub 仓库 `Settings → Pages → Build and deployment → Source` 必须从分支发布改为 `GitHub Actions`。未完成该设置前不能把工作流成功视为已部署。

### 回滚

代码回滚使用 `git revert` 恢复阶段 7 commit，然后由 Pages workflow 重新部署完整 artifact。旧文件如确需恢复，应从阶段 7 前 commit 恢复，不要复制未知本地版本。
# 2026-07-29：统一虚拟人与现有学习工具整合

- 在现有 `assets/memory-partner.js` 和 `assets/memory-partner.css` 上增加统一的 `window.VirtualAgent.init()`，并保留 `window.MemoryPartner` 兼容入口。
- 记忆容量、N-back、长时记忆干扰、长时记忆策略和海报制作五页共用同一虚拟人，提供 AI 学习助手、语音转文字、当前任务和学习进度四个入口。
- 当前任务与进度只读取页面已有 `steps`、`currentStep` 和 `maxUnlockedStep`，不修改步骤验证、解锁、保存、上传或历史状态结构。
- 语音结果增加“确认后写入当前输入框”，继续复用原 `VoiceRecorder` 和 `AsrClient`，并保留复制粘贴回退。
- 组件成功挂载后才隐藏原助手入口；组件缺失或初始化失败时，原 AI 和语音入口继续可用。
- 未加入行为识别、偏题识别、跨实验记忆或学习诊断。
# 2026-07-29：第二阶段学习行为监测

- 新增四个实验页共用的开放性文本行为监测器、脱敏调试摘要与本地最新快照队列。
- 新增 `saveLearningRecord` 云函数，对正式学生身份、字段白名单、文本长度和指标进行服务端校验，并以确定性文档 ID 更新任务记录。
- AI 助手成功打开及语音文本实际写入会分别标记当前任务；海报页不纳入监测。
- 本阶段不包含主动提醒、内容相关性判断、跨实验记忆或最终学习诊断。
# 2026-07-29：第三阶段打字输入支持

- 新增可解释的打字支持规则、持续输入保护和当前设备任务级去重。
- 虚拟人增加非模态语音建议气泡；接受后复用原语音助手并锁定当前输入框，不自动开始录音。
- 新增 `saveAgentIntervention` 云函数及干预离线队列，记录 accepted、dismissed、ignored 和语音实际写入结果。
- 功能只用于描述当前任务可能需要输入支持，不生成学生固定标签，不调用 AI 判断内容。

# 2026-07-29：第四阶段任务相关性支持

- 四个实验页仅对个人长回答增加显式相关性检查，任务标题和说明取自页面现有内容；小组、短答案、海报页和教师端保持排除。
- 新增两层判断：服务端本地规则先识别空白、过短、重复和无效文本，通过后才使用 DeepSeek 进行严格 JSON 语义判断。
- 虚拟人增加不阻塞的偏题、部分相关和内容不足三级提示，学生可查看原任务要求、返回修改或保留原答案。
- 新增 `checkTaskRelevance` 云函数，在服务端核验正式学生和权威任务配置，并将有界快照及检查结果写入 `agent_interventions`。
- AI、网络或返回格式失败统一降级为 `uncertain`，不阻止保存、步骤解锁或报告生成；本阶段不评价答案正确性、不生成标准答案。
# 2026-07-29｜第五阶段：跨四次实验的结构化学生记忆

- 新增四实验公共40题知识题库，资格审查先完成随机知识前测，再进入元认知问卷；旧资格审查记录保持兼容。
- 新增学生签名会话、教师白名单登录和受保护的实验/记忆查询，关闭教师仪表盘临时免登录。
- 新增 `student_memories`、实验记忆生成、学生简化视图、教师详细视图和环节相关的个性化支持。
- 记忆生成仅使用数据库事实与有限学生作品，严格校验AI JSON；失败不覆盖原记忆，也不阻塞实验或报告。
- 本阶段不生成最终学习诊断，不保存完整聊天，不形成学生固定标签。

# 2026-07-30｜第六阶段：四次实验后的个性化学习诊断

- 新增 `learning_diagnoses` 完整版本历史、当前版本指针和一次性学生提示状态。
- 后端验证四次实验最新正式提交及四份当前实验记忆，程序计算客观指标后才调用AI。
- 新增学生精简诊断页、虚拟人诊断入口、第四次实验报告摘要和教师详细诊断视图。
- 相同来源事实直接复用旧版本；来源变化生成新版本；AI失败或结构无效不覆盖已有诊断。
- 诊断仅描述平台内学习表现和支持需要，不构成固定能力、人格、心理或医学判断。

# 2026-07-30｜第七阶段：整体联调与学生数据隔离加固

- `saveExperimentRecord`、`saveLearningRecord`、`saveAgentIntervention` 和 `checkTaskRelevance` 改为校验学生签名会话，并从令牌确定 `studentId`；缺少令牌、令牌篡改或请求体学号不一致均拒绝写入。
- 四个学生写接口均再次核验 `students` 集合；账号不存在或已移除时停止写入，数据库临时查询失败则进入可重试回退。
- 实验草稿、前测、跨页上下文和 AI 本地日志改为按正式学生、游客或匿名身份隔离的浏览器存储键；旧数据只有明确属于当前学生时才迁移。
- AI 请求不再附带学生姓名、学号、班级和小组；清理上传、AI 和云函数中的常规成功日志，保留不含文本、身份或令牌的简洁错误信息。
- 增加系统加固契约，覆盖共享脚本单次加载、单次初始化、请求授权、同文去重、确定性记录、记忆输入上限、诊断不发送原始全文、双账号本地隔离和敏感日志检查。
- 新增 `docs/VIRTUAL_AGENT_SYSTEM.md`，统一记录组件、云函数、集合、记忆与诊断流程、权限、必要索引、部署顺序、线上双账号验收和已知限制。
- `npm run verify` 全部通过；真实 CloudBase 权限、HTTP CORS、AI、麦克风和两个正式学生账号的端到端验收仍需部署后执行。

# 2026-08-08｜学生端手机排版优化

- 将四个实验页标记为统一的 `experiment-page` 响应式作用域，手机端头部取消粘性并压缩到约 222px；桌面端继续保持原有粘性头部和完整八步文字。
- 手机端八步导航改为同屏编号按钮，每个按钮约 45×44px；可见文字收敛为编号，但完整步骤标题继续保留在按钮无障碍名称中。
- 手机端虚拟人启动器从约 92×116px 缩小到 56×64px，隐藏常驻名称，并为实验正文增加底部安全留白；实测页尾主操作按钮与启动器无相交。
- N-back 工作记忆表格在 640px 以下取消固定最小宽度，改为固定布局和自动换行；390px 下表格宽度与容器一致，不再需要横向滚动。
- 首页、登录页和资格审查的手机端关键按钮统一到至少 44px 高，首页退出和案件切换按钮同时达到至少 44px 宽。
- 本次不修改实验步骤、解锁、计时、评分、材料、状态结构、存储键、上传、报告、登录权限或云端数据。
- 使用 Node.js v20.19.0 运行 `npm run verify`、`npm run build` 和 `npm run check:dist`，全部通过；发布包包含 71 个文件、12,879,319 字节。
- 浏览器验证覆盖 390×844 与 1440×900：手机端无页面横向溢出，资格审查顶部按钮均为 44px 高；桌面端头部仍为 `sticky`、步骤文字完整、虚拟人仍为 124×158px。
- 未验证真实 iOS/Android 软键盘、刘海安全区、读屏和触摸拖动；这些项目仍需部署前实机验收。

# 2026-08-22｜学生端手机适配与首屏性能优化

- 首页手机端将 Logo 与登录操作分行，压缩标题和主入口布局；第一场景视频改为首屏完成后的空闲加载，第二场景、案件导航和案件封面改为进入场景时挂载。
- 案件前情组件延迟到案件导航场景初始化，避免角色精灵占用首屏网络；省流量、慢速网络和减少动态效果环境保持静态背景。
- 五个活动页共用“主题切换 + 更多”手机头部和当前步骤文本；低频原按钮只折叠显示，不修改原事件、路由或实验流程。
- 手机端虚拟人缩为 52px 入口，菜单、AI 和语音面板改为安全区内底部抽屉；表单字号和核心触控目标统一到至少 16px/44px。
- 实验一排序增加上移/下移按钮并复用原 DOM 排序保存；两列材料表改为堆叠卡片，多列表格保留受控横向滚动和明确提示。
- 侦探角色精灵增加 359KB WebP 版本，头环、海报示例和角色 PNG 从发布包排除；旧首页背景也不再部署。
- 新增 `scripts/check-mobile-readiness.js` 与 `npm run check:mobile`，覆盖视口、延迟媒体、触控替代、底部抽屉、WebP 和构建排除契约。
- 本次未修改登录权限、实验步骤、计时、评分、状态结构、storage key、CloudBase、AI 请求、语音识别或报告数据格式。
- 真实 iOS/Android 软键盘、麦克风权限、正式学生账号写入、AI 联网回答和 CloudBase 最终提交仍需部署前实机验证。
