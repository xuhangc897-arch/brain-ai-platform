# 前四次实验 PDF 归档：部署清单

## 学生端流程

1. 学生在实验一至四点击“生成报告”。正式提交写入 `experiment_submissions` 后，报告页调用 `experimentReportArchive`。
2. 云函数按登录令牌确定学号，从正式提交重建同一版侦探小结，生成 PDF，上传到云存储 `experiment-reports/<学号哈希>/<报告 ID>.pdf`，并将文件 ID 记入 `experiment_report_archives`。重复调用复用已生成文件。
3. 案件五的“读取实验数据”不占步骤编号。学生登录后能看到自己的四份档案并在页面内查看 PDF；历史正式提交若尚未归档，可以从这里补生成。原“制定初步方案”仍为第 1 步。
4. 游客不能上传或读取云端档案。综合学习诊断与学习记忆不参与 PDF 生成。

## 管理员需要完成

1. 在现有 CloudBase 环境 `memory-detective-platfor-d369a42` 创建数据库集合 `experiment_report_archives`，禁止 Web 客户端直接读写。云函数使用服务端 SDK 访问它。现有 `experiment_submissions` 集合须保持可供云函数读取。
2. 在云存储中为 `experiment-reports/` 设置私有读取和写入规则，禁止学生直接通过 CloudBase SDK 浏览或下载其他人的文件。网页只接收云函数在校验学生令牌后发出的临时访问 URL。若现有存储规则无法按目录配置，需要为整个存储桶选择适合的私有规则并检查其他业务是否受影响。
3. 在「云函数」创建**普通/Event 云函数** `experimentReportArchive`，入口 `index.main`，Node.js 20.19，超时 120 秒，内存 2048 MB。上传 `output/cloudbase/experimentReportArchive.zip`（ZIP 根目录是 `index.js`、`package.json`），选择「保存并安装依赖」。不要选要求监听 9000 端口的 HTTP 云函数；现有接口也采用普通云函数加 HTTP 网关。若安装或运行 Chromium 失败，需改用带 Chromium 系统库和中文字体的自定义镜像或层。不要把私钥放进前端代码。
4. 给这个函数配置与 `studentLogin` **相同**的 `STUDENT_SESSION_SECRET`，以及 `REPORT_RENDER_URL`。按当前 GitHub Pages 配置，后者应为 `https://xuhangc897-arch.github.io/brain-ai-platform/review.html`；发布静态站点后须先从公网确认该地址可访问。该页面只负责渲染服务端提供的正式提交，URL 本身不包含学生数据或令牌。
5. 在「HTTP 网关 → 路由管理 → 新建」选择现有默认域名、关联新函数，触发路径 `/experimentReportArchive`。在跨域设置中允许来源 `https://xuhangc897-arch.github.io`（不含 `/brain-ai-platform` 路径），允许 `POST`、`Content-Type`、`Authorization`。新路由的网关身份认证保持关闭；函数已经用学生签名令牌验证身份。先发布云函数及网关，再发布静态站点。
6. 用一个正式测试学生账号逐次完成四个实验，确认报告页显示“报告已存入平台”，云存储生成四个 PDF，案件五能站内打开且原计划仍标为第 1 步。再用另一个学生账号确认无法请求或看到前一个学生的档案。

本地检查：`npm run check:report-archive`、`npm run verify`、`npm run build`。这些检查验证代码契约，不能代替部署后对 CloudBase、Chromium、中文字体和 PDF 查看器的实测。

## PDF 生成失败排查

- 档案列表能显示“正式数据已提交，PDF 待生成”，只证明查询成功；点击生成后仍需检查 `experimentReportArchive` 的云函数日志。当前 CLI 使用 `tcb logs search`，旧版 `tcb fn log` 接口已下线。
- `@sparticuz/chromium` 提供 headless shell。Puppeteer 启动时使用 `headless: "shell"`，并以同一模式构造 `defaultArgs`；普通 `headless: true` 会造成浏览器目标关闭等错误。
- `renderPdf()` 必须等待 `page.pdf()` 完成后再执行 `finally` 中的 `browser.close()`。直接 `return page.pdf()` 会过早关闭浏览器，引发 `Page.printToPDF: Target closed` 或 `FUNCTIONS_INVOCATION_FAIL`。
- Puppeteer 的 `page.pdf()` 结果须转换成 Node.js `Buffer` 后交给 CloudBase `uploadFile`；直接传入 `Uint8Array` 会触发 `fileContent should be instance of fs.ReadStream or Buffer`。
- 更新函数代码后，确认 `STUDENT_SESSION_SECRET` 和 `REPORT_RENDER_URL` 仍存在，重试一份测试报告，再核对云存储、归档记录、中文文字和页面内 PDF 查看。静态页面的“0”步骤标识及错误提示须随整站构建发布。
