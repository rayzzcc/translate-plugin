# 双语翻译助手（个人版）

一个参考「沉浸式翻译」实现的 Chrome 插件，完全使用**自己配置的大模型 API Key** 进行翻译，无账号、无云同步，数据只存在本地浏览器。

## 功能

| 功能 | 说明 |
|---|---|
| 网页双语对照 | 译文插在原文段落下方；只翻译可视区域附近的段落；自动翻译动态加载的内容（无限滚动 / 单页应用） |
| 显示模式 | 双语对照 / 仅译文，一键切换 |
| 译文样式 | 12 种主题（虚线、波浪线、高亮、马克笔、模糊、引用块、卡片等），可自定义颜色、字号、CSS |
| 悬浮球 | 点击翻译/还原，悬停显示菜单，可拖动，可按网站隐藏 |
| 悬停翻译 | 鼠标放在段落上**轻按 Ctrl** 翻译该段，再按一次还原；按住 Ctrl 移动鼠标可连续翻译 |
| 划词翻译 | 选中文字后点击「译」图标（或设为直接翻译），卡片内可切换目标语言、复制、重译 |
| 输入框翻译 | 在输入框里**快速连按 3 次空格**，把内容翻译成英文（可设置），支持 Ctrl+Z 撤销 |
| 图片解读 | 悬停图片点击「✨ 解读」，或右键「讲解 / 翻译此图片」。**讲解**模式结合网页标题、图片说明和前后文，流式输出解读与总结，并可继续追问；**文字翻译**模式逐条翻译图中文字 |
| YouTube 双语字幕 | 开启字幕（CC）后自动显示双语字幕 |
| PDF 双语阅读器 | 左侧原文页面、右侧逐段译文；支持在线 PDF、本地文件、拖拽打开 |
| 网站 / 语言规则 | 总是翻译 / 永不翻译某些网站或某些语言的网页 |
| 快捷键与右键菜单 | Alt+A 翻译页面，Alt+W 切换模式，Alt+S 翻译选中文字 |
| 缓存 | 翻译结果存在 IndexedDB，同样的文本不会重复请求 |
| 备份 | 设置导入 / 导出 / 恢复默认 |

## 快速开始

需要 Node.js 18 及以上。

```bash
npm install
npm run build        # 首次会自动生成 config.jsonc
```

1. 编辑项目根目录下的 `config.jsonc`，填写 API 地址、Key 和模型（见下文）。
2. 再执行一次 `npm run build`。
3. 打开 `chrome://extensions`，开启右上角「开发者模式」，点击「加载已解压的扩展程序」，选择项目下的 `dist` 目录。
4. 安装后会自动打开设置页。在「翻译服务」里点「测试」，确认服务可以连通。

开发时可以运行 `npm run dev`：修改代码或 `config.jsonc` 后会自动同步到 `dist/`。之后在 `chrome://extensions` 中点击扩展的刷新按钮，再刷新网页即可生效。

## 配置文件 `config.jsonc`

支持 `//` 注释和末尾逗号。详细说明见 [config.example.jsonc](config.example.jsonc)。

```jsonc
{
  "providers": [
    {
      "id": "mimo",                       // 唯一 ID
      "name": "MiMo Flash",               // 显示名
      "type": "openai",                   // openai | anthropic | gemini
      "baseUrl": "https://your-gateway.example.com/v1",
      "apiKey": "sk-xxx",
      "model": "xiaomi/mimo-v2.6-flash",
      "temperature": 0.3,
      "maxConcurrent": 4,                 // 并发数
      "rpm": 0,                           // 每分钟请求上限，0 为不限
      "vision": false,                    // 是否支持识图（图片翻译用）
      "extraBody": { "enable_thinking": false }  // 额外请求参数，例如关闭思考
    }
  ],
  "defaultProvider": "mimo",
  "imageProvider": "",                    // 图片翻译用的服务，留空同 defaultProvider
  "settings": { "targetLang": "zh-CN" },  // 默认设置（可选）
  "prompts": {}                           // 自定义提示词（可选）
}
```

**修改后如何生效**：执行 `npm run build`（`npm run dev` 运行时会自动同步），然后在设置页的「翻译服务」中点击「重新加载配置文件」。也可以直接修改 `dist/config.jsonc`，同样点「重新加载配置文件」即可。

**接口类型说明**
- `openai`：兼容 OpenAI 格式的接口都能用，包括 OpenAI、DeepSeek、通义千问、Kimi、豆包、Ollama 和公司内部网关。`baseUrl` 填到 `/v1` 即可，也可以填完整的 `/chat/completions` 地址。
- `anthropic`：Claude 原生接口。
- `gemini`：Gemini 原生接口。可以用 `extraBody` 设置 `generationConfig.thinkingConfig.thinkingBudget: 0` 来关闭思考。

**优先级**：设置页里的修改 > `config.jsonc` 里的 `settings` > 内置默认值。在设置页「备份与恢复 → 恢复默认」可以清除设置页里的修改。

### `settings` 可配置字段

```jsonc
{
  "targetLang": "zh-CN",
  "displayMode": "bilingual",            // bilingual | translation
  "style": { "theme": "dashed", "color": "", "accentColor": "#6b8afd", "bgColor": "rgba(107,138,253,.14)", "fontScale": 1, "customCss": "" },
  "rules": { "alwaysSites": [], "neverSites": [], "alwaysLangs": [], "neverLangs": [] },
  "floatBall": { "enabled": true, "disabledSites": [], "side": "right", "top": 62 },
  "hover": { "enabled": true, "key": "Control" },          // Control | Alt | Shift | Meta
  "selection": { "enabled": true, "trigger": "icon" },     // icon | auto
  "input": { "enabled": true, "targetLang": "en", "triggerCount": 3 },
  "image": { "enabled": true, "hoverButton": true, "minSize": 160, "mode": "explain" },   // explain | translate
  "video": { "enabled": true, "showOriginal": true, "fontScale": 1 },
  "pdf": { "autoOpen": false, "showOriginal": true },
  "advanced": { "cache": true, "batchSize": 10, "batchChars": 2500, "minTextLength": 2, "rootMargin": 600, "excludeSelectors": "", "pageContext": true }
}
```

## 项目结构

```
manifest.json            扩展清单
config.example.jsonc     配置模板（首次构建复制为 config.jsonc）
scripts/build.mjs        构建脚本（Vite）
public/content.css       注入网页的译文样式
src/background/          Service Worker：配置加载、大模型调用、批量翻译、限流、缓存、右键菜单、快捷键
src/content/             内容脚本：段落识别、整页翻译、悬浮球、划词、悬停、输入框、图片、YouTube 字幕
src/pages/popup/         工具栏弹出窗口（React）
src/pages/options/       设置页（React）
src/pages/pdf/           双语 PDF 阅读器（React + pdf.js）
src/shared/              类型、默认值、语言列表、工具函数
```

## 常见问题

- **点了翻译没反应**：插件安装或重新加载之前就已打开的网页，需要先刷新一次。`chrome://` 等浏览器内置页面无法翻译。
- **翻译很慢**：确认模型没有开启思考模式（见 `extraBody`）；适当调大 `maxConcurrent`；轻量 / Flash 类模型速度明显更快。
- **本地 PDF 打不开**：在 `chrome://extensions` → 本扩展「详情」中开启「允许访问文件网址」，或在阅读器中点「打开本地 PDF」。
- **YouTube 没有双语字幕**：需要先在播放器里开启字幕（CC）；如果字幕本身已经是目标语言，就不会再翻译。
- **API Key 安全**：Key 只保存在本地的 `config.jsonc` 和 `dist/` 中，不会同步到任何地方。不要把这两个位置分享出去。
