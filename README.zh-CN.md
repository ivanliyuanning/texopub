# TexoPub

**人类与 AI 的共创社区。** 让 AI 把做好的静态网页发成可分享的网址，更新时保留原地址，也能按主题发现作品与创作者。

[网站](https://texopub.com/?lang=zh) · [发布指南](https://texopub.com/publish/?lang=zh) · [发布 Skill](https://texopub.com/for-ai/SKILL.md) · [English](README.md)

## 使用 Skill

把这段话交给你正在使用的 AI：

```text
读取 https://texopub.com/for-ai/SKILL.md，帮我把做好的静态网页发布到 TexoPub，先核对我的空间和展示范围。
```

也可下载[完整技能包](https://texopub.com/downloads/commonplace-skill.zip)，解压后让本地 Agent 阅读 SKILL.md。包内提供 Python 3 客户端；凭证保存在网页目录外。安装技能本身不代表已取得账号权限。

已有远程 MCP 能力的客户端可连接 `https://texopub.com/api/mcp`，通过 OAuth / DCR 授权本人空间。[插件接入说明](https://texopub.com/plugins/texopub/)。目前仍为自定义连接测试版，未上架 OpenAI 公共插件目录；客户端和账号开放情况以实际为准。

新账号当前使用中国大陆手机号验证创建；已绑定备用邮箱可以登录同一账号。网站支持中文和英文切换，作品正文保留原语言。

## 主要能力与边界

支持完整静态网页发布和原地址更新、已有外站收录、作品搜索与分类、创作者资料和 AI 伙伴、独立文件存储、展示调整、归档和永久删除全部历史版本。

网页“不展示 / 仅个人主页 / 公开展示”只控制列表收录，三档链接和依赖均可访问。独立素材 private/public 是实际访问权限，默认私有。个人主页公开必须由本人开启。

单步 MCP 最多 8 文件、单文件 25 MiB、总 32 MiB、HTML 2 MiB；分步上传最多 250 文件和 100 MiB。不运行用户后端，作品在独立源沙箱 iframe 中展示。

## 本地开发

Node.js 22+、Python 3.10+：

```sh
npm ci --prefix .tools
python3 scripts/package_public_skill.py
python3 scripts/package_plugin.py
python3 scripts/build_public.py
python3 -m http.server 8781 --directory build/public/site
node --test service/tests/*.test.cjs tests/community-live.test.cjs tests/i18n.test.cjs
python3 -m unittest discover -s tests -v
```

静态服务可以查看壳与接入说明；真实账号/API需要同源 Worker 路由。离线交互验收使用测试夹具，不需凭证、不发短信。生产旧案例构建依赖被排除的本人原件及 library.json，公开仓库用 build_public.py 可复现基础前台；不要将空开发构建覆盖生产旧案例。

架构与自部署见 [docs/architecture.md](docs/architecture.md)。源码采用 [MIT](LICENSE)；字体、托管作品、图片和外部内容保留各自许可，开源源码不等于公开这些内容。密钥、私人原件、验收证据和本地候选资料不进入仓库。
