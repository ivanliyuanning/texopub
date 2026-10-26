# TexoPub.ai

当前对外品牌 **TexoPub.ai**；网站已应用新 logo 和朱橙配色。域名已注册一年并绑定至现有 Pages 网站，HTTPS已通过验证；logo 保持原版。品牌上线及域名报价证据见 `evidence/brand-rollout-20261022/`。

独立项目目录：`/Users/liyuanning/文稿/共创书架`

把人与 AI 共创的静态网页发布到自己控制的网站，图片、视频及其他素材独立存放，自动收录到按主题浏览的导航。先用苏州博物馆导览验证，逐步形成可被读者及 AI 查找的公共知识目录。

## 从哪里开始

继续工作先阅读 [任务进度.md](任务进度.md) 和 [AGENTS.md](AGENTS.md)。目前邀请制云端上传、自动导航、分类体系、独立素材及专属图标均已上线。此目录包含完整源码、原素材、内容快照、发布登记、操作说明与验证记录。

- 网站：https://texopub.com/
- 苏博导览：https://texopub.com/p/suzhou-museum/
- 素材目录：https://texopub.com/materials/
- 上传入口（复制提示词交给AI）：https://texopub.com/publish/
- 可分发Skill包：https://texopub.com/downloads/commonplace-skill-v2.0.0.zip
- 给其他AI的入口：https://texopub.com/for-ai/
- 服务维护：[service/README.md](service/README.md)

## 主要文件

| 位置 | 内容 |
| --- | --- |
| `任务进度.md` | 目标、当前状态、证据、缺口及下一步 |
| `scripts/`、`library` | 本机发布、构建和验证工具 |
| `templates/` | 首页样式、搜索与分类筛选、网页图标 |
| `service/skill/commonplace-remote-publish/` | 对外Skill源码、产品介绍、浏览/发布说明与客户端 |
| `taxonomy.json` | 两级主题分类及稳定ID |
| `content/` | 已收录作品快照及独立素材原件 |
| `library.json` | 原苏博与101份素材的只读基线，新作品及版本由云端D1负责 |
| `publication-state.json` | 防止旧目录覆盖线上结果的版本记录 |
| `cloudflare.json` | 非敏感托管配置 |
| `evidence/`、`history/` | 验证、部署记录和历史登记快照 |
| `tests/` | 发布行为测试及离线DOM交互测试 |
| `source/` | 首个苏博案例的恢复源代码 |
| `历史作品候选.json` | 后续候选，列入候选不等于已授权公开 |
| `build/` | 构建输出，可由工具再生成 |

## 常用命令

```sh
commonplace remote list
commonplace remote categories
commonplace build
python3 -m unittest discover -s tests -v
node tests/directory.test.cjs
```

新增作品需要用户明确授权公开，并由 AI 选择有效二级分类、制作专属图标：

```sh
commonplace remote publish /absolute/path/report.html --slug report-name --title '作品标题' --category humanities/museums --icon /absolute/path/report-icon.svg --format guide
```

更新已有作品使用同一 slug 加 `--update`；独立素材使用 `commonplace remote assets /path/to/file --slug file-name --title 标题`。完整流程见本机技能 `/Users/liyuanning/.codex/skills/commonplace-publish/SKILL.md`。旧的本机全量 `publish/assets/deploy` 已拦截；不要用旧的 `scripts/build.py` 覆盖云端目录，不直接上传整个项目文件夹。

## 项目独立与应用入口

2026-10-22 从日常生活子目录完整迁移至此，原目录保留为兼容软链接，实际文件只有一份。发布命令和技能入口已指向此目录，迁移证据见 `evidence/project-migration-20261022/`。

应用项目已注册并核对：当前显示名称为“AI123”，项目文件夹是本目录。原对话“规划个人网页部署与共享索引库”已归属该项目，工作目录也已切换到本目录。应用名称与文件夹名称可以不同；保留用户选择的“AI123”，不擅自改名。后续从该项目继续，让 AI 先读 `任务进度.md` 即可恢复上下文。核验证据见 `evidence/project-migration-20261022/app-registration.json`。
