# 实验注册表与公共页面桥接

本文档定义阶段 4 引入的实验注册表和页面公共桥接边界。目标是让实验 ID、显示名称、页面路由、报告元数据和本地状态 key 只有一个浏览器运行时来源，同时保持现有实验流程和上传数据不变。

## 一、运行时入口

- `assets/experiment-registry.js` 暴露只读的 `window.BrainExperimentRegistry`。
- `assets/experiment-bridge.js` 暴露只读的 `window.BrainExperimentBridge`。
- 注册表必须先于 `assets/platform-core.js` 加载。
- 桥接模块必须在公共核心和 `assets/experiment-uploader.js` 之后加载。

## 二、注册字段

每个模块使用以下字段中的适用部分：

- `id`：上传、查询和路由使用的稳定模块 ID。
- `label`：教师后台等通用界面的显示名称。
- `kind`：`experiment`、`screening` 或 `service`。
- `order`：实验展示顺序。
- `caseNo`、`caseTitle`、`activityName`：报告元数据。
- `reportType`：`science` 或 `poster`。
- `route`：学生端入口页面。
- `storageKey`：该模块现有 localStorage key。
- `reportEnabled`：是否允许生成统一报告。

当前模块 ID：

- 五个实验：`memory`、`nback`、`interference`、`strategies`、`poster`
- 资格审查：`screening`
- AI 对话记录：`aiChat`

这些 ID 与 `saveExperimentRecord` 云函数的允许集合必须完全一致。注册表检查脚本会阻止二者静默分叉。

## 三、公共桥接边界

`BrainExperimentBridge.submitState()` 只负责原页面已经重复执行的动作：

1. 可选地同步当前页面思考字段。
2. 克隆或接收页面生成的完整状态快照。
3. 保持原字段生成 `submission` 记录。
4. 保持原 `clientRecordId` 格式。
5. 调用现有可靠上传器。

`BrainExperimentBridge.finishReport()` 只负责：

1. 保持原顺序提交当前模块 AI 对话记录。
2. 从注册表取得报告 URL。
3. 在新窗口打开报告。

桥接模块不负责实验步骤、计时、刺激材料、评分、过程记录、页面状态保存或报告内容计算。

## 四、增加实验时的最小步骤

1. 在注册表增加唯一条目，确认 ID、路由和 storage key 不冲突。
2. 在保存云函数允许模块集合中加入同一 ID。
3. 新页面按规定顺序加载注册表、公共核心、认证、上传器和桥接模块。
4. 使用桥接模块提交完整状态；实验特有过程记录仍由该实验自行管理。
5. 若支持报告，为报告页增加对应内容构建器。
6. 为教师后台的实验特有统计和导出增加显式处理。
7. 运行 `npm run check:contracts` 和 `npm run check:baseline`，再进行学生流程人工回归。

## 五、不属于注册表的内容

- 实验题目、材料和步骤状态机。
- 计时、随机化、评分和结果计算。
- 各实验特有的过程记录结构。
- 数据库权限与身份授权。
- 教师后台各实验特有的 Excel 工作表结构。

这些内容不能为了“注册表统一”被塞入一个通用配置对象；需要独立设计和测试。
