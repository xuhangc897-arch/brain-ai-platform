# 平台统一身份、配置与数据契约

本文档定义阶段 4 完成后的浏览器公共契约。实验模块元数据入口为 `assets/experiment-registry.js`，平台配置、身份和实验记录契约入口为 `assets/platform-core.js`。浏览器分别通过 `window.BrainExperimentRegistry` 和 `window.BrainPlatform` 使用这些契约。

## 一、版本规则

- 当前身份契约版本：`1`
- 当前实验记录契约版本：`2`
- 新写入的学生会话携带 `schemaVersion: 1`，新上传及数据库实验记录携带 `schemaVersion: 2`。
- 历史会话或实验记录没有 `schemaVersion` 时，按 v1 兼容读取；v1 上传由云函数规范写入为 v2。
- 不在普通页面加载过程中批量改写或删除历史数据。
- 云函数拒绝明确声明为不支持版本的新实验记录，错误码为 `UNSUPPORTED_SCHEMA_VERSION`。

## 二、配置契约

`window.BrainPlatform.config` 是浏览器环境与接口配置的唯一来源：

- `envId`：CloudBase 环境 ID。
- `endpoints`：学生登录、学生导入、实验记录保存、实验记录查询和 AI 对话接口。
- `storageKeys`：学生会话、可靠上传 outbox、探究上下文、AI 对话、前测结果、资格结果及五个实验状态 key。其中模块相关 key 从实验注册表派生。

页面不得重新硬编码以上地址和 key。实验 ID、名称、页面路由、报告元数据和实验状态 key 的定义见 `docs/EXPERIMENT_REGISTRY.md`。CloudBase 云函数使用 `cloudbase.SYMBOL_CURRENT_ENV`，由部署环境决定当前环境；`cloudbase.json` 继续作为部署配置来源。

## 三、身份契约

### 学生会话存储

- localStorage key 保持为 `studentSession`。
- 旧字段继续保留：`studentId`、`name`、`class`、`group`、`mustChangePassword`。
- v1 新增规范字段：`schemaVersion`、`role`、`isGuest`。
- 兼容读取别名：
  - `studentName` → `name`
  - `className` → `class`
  - `groupName` 或 `groupId` → `group`

学生会话示例：

```json
{
  "schemaVersion": 1,
  "role": "student",
  "isGuest": false,
  "studentId": "2026001",
  "name": "示例学生",
  "class": "七年级一班",
  "group": "第一组",
  "mustChangePassword": true
}
```

游客会话继续使用 `studentId: "guest"`，并规范为 `role: "guest"`。游客实验记录仍只保存在本地，不上传后台。

### 身份边界

- `BrainPlatform.identity` 负责学生/游客浏览器会话的一致读写。
- `cloudbase.js` 中的 CloudBase Auth 当前只提供教师页面所需的 SDK 登录态和调用通道。
- 浏览器身份不是服务端授权依据。
- `role` 是数据契约字段，不等于已完成权限认证。
- 服务端角色校验和学生数据归属校验仍属于后续核心授权阶段。

## 四、实验记录契约

上传信封：

```json
{
  "schemaVersion": 2,
  "module": "memory",
  "recordType": "submission",
  "records": []
}
```

允许的模块：

- `memory`
- `nback`
- `interference`
- `strategies`
- `poster`
- `screening`
- `aiChat`

允许的记录类型：

- `experiment`
- `state`
- `submission`

每条新记录由公共契约补齐：

- `schemaVersion`
- `studentId`
- `studentName`
- `className`
- `groupName`
- `createdAt`
- `clientRecordId`

`clientRecordId` 的生成顺序保持与阶段 2 之前一致，避免相同实验记录因为契约接入而生成新的去重 ID。

云函数把 v1 或 v2 上传统一写入数据库模型 v2，并继续保留 `module`、`recordType`、学生身份、`data`、`createdAt` 和 `uploadedAt` 等教师后台兼容字段。历史无版本文档继续由教师后台按原字段读取，不执行批量回填。

数据库 v2 的完整字段定义见 `docs/DATABASE_MODEL_V2.md`。

## 五、可靠上传契约

- outbox localStorage key：`experiment-upload-outbox-v1`
- 请求发出前必须先把记录写入 outbox。
- outbox 按 `studentId` 分区，只能重试当前学生的记录。
- 游客记录不进入 outbox。
- 成功或服务端确认重复后移除记录。
- 网络错误、HTTP 408/429/5xx、临时数据库错误和滚动部署期间的 v2 不支持错误保留并重试。
- 明确的无效模块、无效记录类型或无效记录属于不可重试错误。
- 重试采用指数退避，最长五分钟；页面加载和浏览器 `online` 事件会重新触发。
- 单个浏览器最多保留 200 条待上传记录，记录保留七天。
- 退出登录不会把其他学生的待上传记录归属给下一位学生。

## 六、加载顺序

- 所有使用公共核心的页面必须先加载 `assets/experiment-registry.js`。
- 学生实验页面：`assets/experiment-registry.js` → `assets/platform-core.js` → `auth.js` → `assets/experiment-uploader.js` → `assets/experiment-bridge.js`
- 首页和登录页：`assets/experiment-registry.js` → `assets/platform-core.js` → `auth.js`
- AI 助手页面必须在加载 `assets/ai-assistant.js` 前加载公共核心。
- 报告页：`assets/experiment-registry.js` → `assets/platform-core.js` → `assets/review.js`
- 教师页：CloudBase Web SDK → `assets/experiment-registry.js` → `assets/platform-core.js` → `cloudbase.js`

`npm run check:contracts` 会验证以上顺序、旧会话兼容、游客行为、上传载荷和云函数写入契约。

## 七、扩展规则

增加实验、身份字段、接口或存储 key 时：

1. 先更新实验注册表或公共契约及对应文档。
2. 增加向后兼容测试。
3. 明确无版本历史数据的读取方式。
4. 若需要迁移，提供 dry-run、备份、数量校验和回滚方案。
5. 不得在单个页面中先行硬编码新值。
