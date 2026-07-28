# 实验记录数据库模型 v2

阶段 3 在现有 `experimentRecords` 集合内采用 v2 文档，不新建集合、不迁移历史记录。这样可以保留教师后台查询和导出，同时逐步建立清晰的数据所有者、活动、时间和载荷边界。

## 一、写入模型

```json
{
  "schemaVersion": 2,
  "sourceSchemaVersion": 2,
  "recordId": "record_<sha256(clientRecordId)>",
  "owner": {
    "studentId": "2026001",
    "studentName": "示例学生",
    "className": "七年级一班",
    "groupName": "第一组",
    "verifiedByStudentCollection": true
  },
  "activity": {
    "module": "memory",
    "recordType": "submission",
    "sourceModule": ""
  },
  "timestamps": {
    "clientCreatedAt": "2026-07-28 10:00:00",
    "receivedAt": "<CloudBase serverDate>"
  },
  "payload": {},
  "module": "memory",
  "recordType": "submission",
  "studentId": "2026001",
  "studentName": "示例学生",
  "className": "七年级一班",
  "groupName": "第一组",
  "data": {},
  "clientRecordId": "memory|submission|...",
  "createdAt": "2026-07-28 10:00:00",
  "uploadedAt": "<CloudBase serverDate>"
}
```

`payload` 是 v2 规范载荷；`data` 和其他顶层字段是教师后台 v1 兼容视图。两者在当前阶段由同一次云函数写入产生。

## 二、幂等规则

- 客户端继续生成稳定 `clientRecordId`。
- 服务端对 `clientRecordId` 计算 SHA-256，并以 `record_<hash>` 作为 CloudBase 文档 ID。
- 同一记录并发写入或响应丢失后重试，最终只能占用同一文档 ID。
- 写入前仍查询 `clientRecordId`，用于识别历史 v1 文档及返回 `duplicate`。
- 文档 ID 不包含学号、姓名、模块或实验正文。

## 三、版本兼容

- 无版本和显式 v1 上传均被接受，并以 `sourceSchemaVersion: 1` 写成 v2 文档。
- v2 上传以 `sourceSchemaVersion: 2` 写入。
- 其他明确版本返回 `UNSUPPORTED_SCHEMA_VERSION`。
- 历史无版本/v1 数据不回填、不删除，教师后台继续按兼容字段读取。

## 四、逐条写入结果

保存云函数对每条记录返回：

```json
{
  "clientRecordId": "...",
  "recordId": "record_...",
  "status": "stored | duplicate | skipped | failed",
  "code": "",
  "retryable": false
}
```

- `stored`：已确认写入。
- `duplicate`：历史或 v2 文档已经存在。
- `skipped`：记录缺少必要字段，不应重试。
- `failed`：本次数据库操作失败；当前标记为可重试。

批量中的单条失败不会阻止其他记录写入。

## 五、建议索引

正式环境应核对或建立：

1. `clientRecordId` 单字段索引，用于历史与 v2 去重查询。
2. `module + recordType + uploadedAt` 复合索引，用于教师端模块查询。
3. `studentId + recordType + uploadedAt` 复合索引，用于学生记录查询。
4. `className + groupName + uploadedAt` 复合索引，用于教师端班级和小组筛选。

确定性文档 ID 提供最终幂等性，不依赖唯一索引；以上索引主要用于查询性能。索引需要在真实 CloudBase 环境中核对，本阶段没有远程修改数据库配置。

## 六、部署顺序

1. 先部署兼容 v1/v2 的 `saveExperimentRecord` 云函数。
2. 验证 v1 模拟载荷、v2 模拟载荷和重复请求。
3. 再部署 `assets/platform-core.js` 与 `assets/experiment-uploader.js`。
4. 最后部署其他静态页面。

如果静态资源先部署，outbox 会把旧云函数返回的 `UNSUPPORTED_SCHEMA_VERSION` 视为滚动部署期间的可重试错误并保留记录；云函数升级后会继续重试。

## 七、回滚

- 前端回滚后，旧 v1 客户端仍可被新云函数接受。
- 云函数回滚前必须先回滚前端，避免旧云函数长期拒绝 v2。
- 已写入 v2 的文档保留全部 v1 兼容字段，旧教师后台仍可读取。
- 不需要删除 `schemaVersion`、`owner`、`activity`、`timestamps` 或 `payload`。
