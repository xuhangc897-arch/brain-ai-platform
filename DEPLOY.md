# 部署说明

本项目是普通静态 HTML 项目，不是 React / Vite / Next.js / Vue 项目。

## 推荐部署方案

推荐使用 GitHub Pages 部署网页主体。原因：

- 项目无需 build，直接发布根目录即可。
- 页面之间使用相对路径跳转，适合 GitHub Pages。
- 数据保存在访问者浏览器的 `localStorage`，不需要后端服务。

注意：第三实验的 3 个情绪视频文件总计约 1GB，不能直接上传到 GitHub Pages 仓库。请将视频放到外部公开视频地址，再填写到 `interference.html` 的 `EXTERNAL_EMOTION_VIDEOS` 配置中。

## Build 命令

无需 build。

在部署平台中可填写：

```bash
echo "No build required"
```

## 输出目录

```bash
.
```

也就是项目根目录，根目录中必须包含 `index.html`。

## 本地检查命令

```bash
node -e "const fs=require('fs'); for (const f of ['index.html','memory.html','nback.html','interference.html','strategies.html','poster.html']) { const s=fs.readFileSync(f,'utf8'); [...s.matchAll(/<script>([\\s\\S]*?)<\\/script>/g)].forEach(m=>new Function(m[1])); console.log(f,'ok'); }"
```

## GitHub Pages 上线步骤

1. 创建一个 GitHub 仓库。
2. 上传项目文件，但不要上传 `assets/interference/emotion/*.mp4`。
3. 进入仓库的 `Settings` -> `Pages`。
4. `Build and deployment` 选择 `Deploy from a branch`。
5. Branch 选择 `main`，目录选择 `/root`。
6. 保存后等待 GitHub Pages 部署完成。

上线网址通常是：

```text
https://你的用户名.github.io/仓库名/
```

## 第三实验视频配置

在 `interference.html` 中找到：

```js
const EXTERNAL_EMOTION_VIDEOS = {
  "中性": "",
  "悲伤": "",
  "愉悦": ""
};
```

把空字符串替换为可公开访问的 mp4 地址，例如：

```js
const EXTERNAL_EMOTION_VIDEOS = {
  "中性": "https://example.com/neutral.mp4",
  "悲伤": "https://example.com/sad.mp4",
  "愉悦": "https://example.com/pleasant.mp4"
};
```

如果暂未配置视频地址，第三实验在情绪视频阶段会提示联系教师配置视频链接或线下观看视频，其他流程仍可继续。

## AI 助手后端部署

本项目的网页主体仍然是 GitHub Pages 静态页面，但 AI 助手需要一个后端接口转发 OpenAI 请求，避免把 API Key 暴露在前端。

### 1. 前端部署

前端继续使用 GitHub Pages：

```bash
echo "No build required"
```

输出目录仍然是：

```bash
.
```

### 2. Vercel 后端部署

项目中已经新增：

```text
api/chat.js
.env.example
```

可以把整个仓库导入 Vercel，也可以只把包含 `api/chat.js` 的项目部署到 Vercel。Vercel 会自动把 `api/chat.js` 作为 Serverless Function。

### 3. 设置 OpenAI API Key

在 Vercel 项目中进入：

```text
Project Settings -> Environment Variables
```

新增环境变量：

```text
OPENAI_API_KEY=你的 OpenAI API Key
```

不要把真实 API Key 写入 GitHub 仓库。`.env.example` 只是示例文件，真实 `.env` 已经加入 `.gitignore`。

### 4. 配置前端 AI_API_ENDPOINT

Vercel 部署完成后，会得到类似下面的网址：

```text
https://your-project.vercel.app
```

打开 `assets/ai-assistant.js`，找到：

```js
const AI_API_ENDPOINT = "";
```

改成：

```js
const AI_API_ENDPOINT = "https://your-project.vercel.app/api/chat";
```

然后重新上传到 GitHub Pages。

### 5. 本地和上线检查

未配置 `AI_API_ENDPOINT` 时，网页右下角 AI 助手会提示“请先配置 AI 后端地址”。配置完成后，在任意页面点击右下角 `AI` 按钮并输入问题，即可调用 Vercel 后端。

AI 助手的系统提示词已经限制为“启发式提示”，不会直接代写实验答案。
