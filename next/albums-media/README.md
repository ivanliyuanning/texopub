# 专辑与网页资源托管：本地交互预览

2026-11-02，分支 `codex/albums-media-preview`。以用户最新澄清为准：专辑只组织网页；视频、音频和图片一样，是由AI单独上传并替换引用的网页依赖。此前混排音视频专辑、独立音视频作品页与平台链接收录的理解已撤回。

## 打开

- 专辑：<http://127.0.0.1:8792/albums/huidong-tennis-test/>（只含标注网页）
- 网页：<http://127.0.0.1:8792/p/tennis-annotation/?from=huidong-tennis-test>
- 素材库：<http://127.0.0.1:8792/space/materials/>（统一文件资源与引用关系）
- 技术验收页：<http://127.0.0.1:8792/dependency-check/>（网页内video/source与audio/source，不进入专辑）
- 多专辑排版：<http://127.0.0.1:8792/u/preview/?albums=demo>
- 验收面板：<http://127.0.0.1:8792/preview/>

```sh
python3 next/albums-media/serve.py
```

只监听本机8792与8793；可用 `--port` 更改主端口（资源源为主端口+1）。主服务启动时运行 `prepare_resources.py`，使用既有已授权的本地标注分享包和回执准备替换副本。8793模拟素材上传后服务返回的固定SHA资源地址，不是真实云端上传。

## 实际效果与边界

标注网页实际引用65张图片、两段含声视频，保持原字节。HTML从64,569,740字节的内嵌版减至78,941字节（默认端口下）；替换可逆，未改原件。网页仍能播放、拖动、倍速、切换片段、放大原帧、前后帧对照和循环试听节点。媒体不在专辑中单列，也不新建独立音视频作品。

HTML变小不等于媒体被压缩。按需加载、正确MIME/Range/CORS与缓存是后续生产链路需要一起验证的能力。本机只读资源源支持这些读取行为，但不能当作已修复/上线生产Worker。现有服务单文件25MiB等限制不因本预览自动提高。

素材库把图片、视频、音频统一当文件，显示大小、类型与引用网页，直接打开资源文件。65张图片与两个视频来自标注网页；额外WAV是从同一已有片段解码的本地技术样例，只被技术验收页引用，不计划作为正式内容发布。

专辑和标注网页正式范围仍约定unlisted。保留个人主页顶部专辑区域、多个专辑网格、第二隐藏专辑复用同一网页、封面与分享卡片、独立展示设置及清晰的访客/本人文案。验收面板的管理控件只改本地模拟状态，不操作生产服务。

技术样例默认 `preload=none`，可实际验证点击后加载和播放独立视频/音频。正式标注页保留既有播放器交互。原页的试标准确率/听审限制保留，不能把网页功能验证说成标注质量合格。

## 源文件与证据

- 输入包：`evidence/albums-media-20261102/staging/tennis-annotation/`。
- 引用替换副本：`evidence/albums-media-20261102/staging/tennis-annotation-resource-urls/index.html`。
- 原字节回执：`annotation-preparation.json`；引用映射：`preview/dependency-manifest.json`。
- 浏览器验收：`preview/resource-correction-verification.json`及`web-only-album-*`、`web-inline-media.png`、`resource-library-audio.png`。
- 多专辑/访客专项：`preview/layout-clarity-verification.json`。

媒体、来源数据及截图继续在Git忽略目录，不提交私人原件或凭证。新拉取源码的机器需要自己准备已授权的本地样例，不把源码仓库当作私人资源分发包。页面所用三份公开作品为旧目录快照，不查询本人私人账号。

## 检查

先启动服务：

```sh
node --check next/albums-media/app.mjs
node --check next/albums-media/model.mjs
node --check next/albums-media/preview.mjs
python3 -m py_compile next/albums-media/serve.py next/albums-media/prepare_resources.py
node next/albums-media/tests/acceptance.cjs
node next/albums-media/tests/layout-clarity.cjs
```

浏览器测试复用现有Playwright与Chrome，在独立浏览器上下文运行，不改变用户当前面板测试选择。测试针对最新网页资源含义重写；之前混排音视频和虚拟上传的21组结果只是历史，不能作为本版本验收证据。

本轮只修正方案与本地预览，未迁移/部署、未发布正式专辑/网页/资源、未更新线上Skill/CLI/MCP。后续生产工作以 `docs/专辑与音视频收录方案-20261102.md` 的新版边界为准。
