# 任务相关性判断

## 边界

任务相关性判断只用于识别当前开放性任务中的明显偏题、无效输入或内容不足，不评价答案是否科学正确，不评分，不生成或替换学生答案。学生始终可以保留原答案并继续保存、切换步骤或生成报告。

四个实验页只对个人长回答启用 `data-relevance-check="true"`。小组共识、实验回忆、短答案、数字和选择控件、身份字段、海报页及教师端均不启用。

## 任务配置与前端接口

- 浏览器配置：`assets/task-relevance-config.js`
- 服务端权威配置：`cloudfunctions/checkTaskRelevance/task-config.js`
- 静态检查会比较两份配置的实验、阶段、任务、原始任务文本、主题、参考概念和最低长度，防止漂移。
- 页面加载 `assets/task-relevance.js` 后调用：

```javascript
TaskRelevance.init({ experimentId });
```

控制器还提供 `checkTarget()`、`checkStage()`、`submitStage()` 和 `flush()`。检查只在明显修改后的失焦、成功完成环节和最终报告提交时发生；现有逐输入自动保存不调用 AI。

同一规范化文本使用 SHA-256 去重。AI 或网络失败统一按 `uncertain` 处理，不弹出偏题提示，也不阻塞页面。

## `checkTaskRelevance` 接口

请求必须携带正式学生签名会话的 `Authorization: Bearer <token>`，并同时发送 `studentId`、`experimentId`、`stageId` 和 `taskId`。服务端从令牌确定学生身份并拒绝请求体学号不一致的请求；同名任务在不同实验中不会混用。

```javascript
{ action: "check", studentId, experimentId, stageId, taskId, inputText, trigger, pageId }
{ action: "interaction", studentId, experimentId, stageId, taskId, textHash, interaction, pageId }
{ action: "submit", studentId, experimentId, stageId, taskId, finalText, trigger, pageId }
```

`interaction` 仅接受 `view_task`、`return_modify`、`keep` 和 `closed`。输入文本最长 2,000 个 Unicode 字符。服务端先执行空文本、最低长度、重复字符、无效短语和乱码初筛；通过后才调用 DeepSeek `deepseek-v4-flash`，密钥环境变量为 `OPENAI_API_KEY`。

AI 输出严格校验为：

```javascript
{
  status: "relevant" | "partially_relevant" | "off_topic" |
          "insufficient" | "inappropriate" | "uncertain",
  confidence: 0.0,
  reasonCode: "...",
  briefReason: "...",
  supportHint: ""
}
```

非法 JSON、未知字段或枚举、越界置信度和超长文本均降级为 `uncertain`。偏题提示阈值为 `0.85`，部分相关支架阈值为 `0.70`；每项任务最多提示两次。

## 数据与部署

相关性记录写入现有 `agent_interventions` 集合，`interventionType` 为 `task_relevance`。确定性文档 ID 由学生、实验、阶段、任务和干预类型生成。

每个文档最多保留四个完整文本快照：首次判断、触发提示、提示后修改和最终提交；每份最多 2,000 字。检查历史最多五项，另保留有限哈希用于避免重复 AI 调用。交互与提交更新进入 `task-relevance-outbox-v1`，最多 100 项、保留 7 天。

部署顺序：

1. 确认 `agent_interventions` 禁止 Web 客户端直接读写，并为 `studentId + updatedAt`、`studentId + experimentId + stageId` 建立复合索引。
2. 为 `checkTaskRelevance` 配置 `OPENAI_API_KEY` 以及与 `studentLogin` 完全相同的 `STUDENT_SESSION_SECRET`，部署并验证云函数；HTTP 网关必须允许 `Authorization` 请求头。
3. 发布静态资源。
4. 使用正式测试学生验证创建、同文去重、修改更新和最终提交。

本地执行 `npm run check:task-relevance`；完整回归执行 `npm run verify`、`npm run build` 和 `npm run check:dist`。自动检查不连接真实 CloudBase 或 DeepSeek，部署前仍需在隔离测试账号下完成线上冒烟测试。
