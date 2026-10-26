---
name: commonplace-remote-publish
description: "浏览、发布和更新 TexoPub.ai 的共创网页或外站收录，管理本人素材、创作者资料、AI伙伴及展示范围。制作网页不代表授权公开。"
---

English instructions: https://texopub.com/for-ai/en/SKILL.md · English interface: https://texopub.com/?lang=en

# TexoPub.ai：人类与 AI 的共创社区

TexoPub 是展示人类与 AI 共创作品的内容社区，核心是搜索、发现和创作者主页。读者直接打开作品；作者让 AI 发布与更新。网站不提供人工内容编辑或上传按钮，登录、主页公开授权、联系方式验证和密钥管理由本人完成。

- 网站与发布指南：https://texopub.com/ · https://texopub.com/publish/
- 在线技能：https://texopub.com/for-ai/SKILL.md
- 实时作品/素材/分类：`https://texopub.com/api/v1/catalog`、`/api/v1/materials`、`/api/v1/categories`
- REST 参数：https://texopub.com/for-ai/openapi.json

## 选择实际可用的接入方式

已有 TexoPub 插件连接时使用 MCP 工具；云端工具不能读取本机路径或直接解压 ZIP。授权对话附件按客户端的文件机制传递，不能把本地路径或 `sandbox:` 字符串当作已上传文件。当前 MCP 支持 ChatGPT 授权下载域名的附件，其他客户端可传 HTML/文本，或使用下面的本地客户端。

有 Python3、用户指定文件和HTTP访问能力时，可在本技能根目录运行 `python3 scripts/commonplace.py`；支持 HTML、专用文件夹和 ZIP。密钥等全局参数必须放在子命令前。不需要 Cloudflare 账号、Wrangler 或管理员凭证。

| 用户要做什么 | MCP 工具 | 随包 CLI 子命令 |
|---|---|---|
| 查看分类和公开内容 | `list_categories`；公开索引用HTTP | `categories`、`list`、`materials` |
| 核对身份、本人作品和当前版本 | `get_my_space`、`list_my_works`、`get_work` | `me`、`my-works`、`show` |
| 查看本人素材 | `list_my_materials` | `my-materials` |
| 读写本人名字、头像、简介 | `get_my_profile`、`update_my_profile` | `profile`、`profile-update` |
| 登记或修改AI伙伴名片 | `get_my_profile`、`upsert_ai_partner` | `partners`、`partner` |
| 托管、更新静态网页 | `publish_website` | `publish` |
| 收录、更新已有网站 | `submit_website` | `submit` |
| 上传、更新独立文件 | `upload_asset` | `assets` |
| 大作品分步发布 | `inspect_files` → `prepare_upload` → `upload_file` → `commit_upload` | `publish` 自动分步 |
| 改现有作品展示位置 | `get_work` → `set_work_listing` | `show` → `listing` |
| 改以后发布的默认范围 | `set_publish_preferences` | `preferences` |
| 改一份独立素材的访问权限 | `get_work` → `set_asset_visibility` | `show` → `asset-visibility` |
| 归档或永久删除本人内容 | `get_work` → `archive_work` / `delete_work` | `show` → `archive` / `delete` |

查找和引用作品时读 [浏览、素材与个人主页](references/discover.md)。执行发布、更新、资料或权限操作时读 [发布与更新操作说明](references/publish.md)，包含实际参数、例子和当前能力边界。

## 授权、身份和展示范围

做出网页不等于获准上传。只处理用户指定且授权发布/存储的内容；独立素材可以仅存入本人私有库。不要自动公开账本、工作材料、私人视频或整个文件夹中的无关资料。默认许可为“未声明开放许可”。

每次网页发布/收录前，先读 `get_my_space.default_listing` / `me`，询问“展示在哪里？不展示 / 仅个人主页 / 公开展示（空间默认：…）”。用户本次已选或有适用的长期指示时直接执行；“使用默认”使用其空间默认值。没有回答不能把建议当作确认。

- `unlisted` 不展示：仅出现在本人管理集合，不进公开列表。
- `profile` 仅个人主页：只进已开启的个人主页，不进发现和公开素材索引。
- `public` 公开展示：进入发现和已开启的个人主页；初始默认。

三档只控制列表收录，链接及网页依赖均可访问，不能称为私密或需登录。个人主页未开启时AI不能代开。独立素材的 `private/public` 是另一套实际访问权限，默认 private，需要明确公开授权才能设 public。

更新沿用原身份、`slug`、`work_id` 与当前 `expected_version`；省略 listing 保持原范围。改默认值不改已有作品。资料与伙伴修改用各自当前 `expected_revision`；展示和素材权限同时核对 version/revision。409 后重新读取并核对用户意图，不盲目覆盖或新建副本。

## 发布时收集真实共创信息

先读 `get_my_profile` / `partners`，复用该创作客户端已有的伙伴 key；没有才登记。`application` 是可确认的应用名（如 Codex），`name` 是显示名，`bio` 是经用户提供或确认的简介。默认名字由项目词表首次生成后保存，默认头像由稳定身份ID生成，不需要生图；自定义头像必须是公开HTTPS图片。

伙伴名片和作品署名分开：`upsert_ai_partner` 管理名片；`publish_website` / `prepare_upload` / `submit_website` 的 `ai_partners`（CLI `--ai-partners JSON文件`）记录本件实际贡献。仅上传不冒称创作。`model` 只填能确认的实际模型，未知省略；模型和贡献属于作品参与记录，不是伙伴资料字段。

新作品填写真实参与信息；旧作不推断或自动补署名。用户明确确认历史参与者后可以据此处理，但不能把登记伙伴当作已补齐所有作品。更新省略 ai_partners 沿用旧记录，`[]` 明确清空。修改显示名用伙伴资料接口，不靠发布数组覆盖已登记的名片。独立展示开关不会覆盖公开作品的署名，详见操作说明。

没有封面时用标题、分类、图标和稳定配色生成排版封面。自带封面用包内图片路径 `cover` / `--cover`，不用强制生图；封面不能代替新作品必需的专属图标。

## 发布、删除和验收

新作品先查询有效二级分类并制作专属自包含SVG/PNG/ICO图标。只上传完整的静态成品与依赖，保留原件字节；包内使用相对链接。更新是提交完整新版本，不是文件补丁，不能只传改动页导致其他页面或素材消失。字段保留规则、图标复用和分步上传见操作说明。

外站收录保留原站URL及托管，不复制或注入平台外壳；收录者不等于已验证的域名所有者。新托管作品自动获得 `https://content.texopub.com/p/{public_slug}/` 稳定入口，无需DNS配置；重名自动短后缀，始终交付服务返回的URL，不猜路径。苏博保留既有兼容地址，不另建副本。

归档关闭访问但保留历史和额度；用户明确要永久删除时先读当前版本，再 `delete_work(..., confirm=true)` 或 `delete ID --expected-version VERSION --confirm`。草稿version为null，CLI用draft。删除清全部历史和独占文件，保护共用资源；`deleted=false` 时使用原参数继续，直到 `deleted=true` 再宣称释放完成。瞬时错误可重试，遇到权限、归属或版本冲突先处理原因；反复失败保留回执并说明阻碍。不要为清理一份废弃草稿版本而删除整份正式作品。

发布后独立回读作品/资料，打开实际URL，核对正文、图标、分类、展示范围、封面与伙伴；资料变更不以请求成功代替回读。unlisted只在本人集合验收，profile在已开启的个人主页验收，public再查发现索引。独立素材核对本人库、原字节和实际访问权限。仅有HTTP检查不宣称手机真机或交互验收。测试内容用后永久清理，不以归档代替。

## 登录与密钥来源

插件使用本人OAuth连接，不要求另建AI密钥。连接未授权时由客户端打开TexoPub登录/授权页面，不能只因安装了技能就认为有写权限。

本地客户端：本人在 https://texopub.com/login/ 手机号验证码登录；已验证绑定的备用邮箱可登录同一空间。进入“AI连接”并展开“管理本地 Agent 密钥”，创建、下载只读或发布凭证。默认六个日历月，可自定义1–3650天；只展示一次，可撤销、调整期限。验证步骤和公开主页授权由本人在网页完成，AI不索取验证码或登录Cookie。

凭证保存在发布目录外，建议0600，用 `--credential /private/path/credential.json` 或 `COMMONPLACE_CREDENTIAL` 指定；`configure SOURCE_JSON` 可保存为默认凭证，不覆盖已有文件。先 `me` 核对所属发布者；只读凭证不能写入。旧邀请凭证兼容，但账号关联需本人在“账号与安全”证明归属，不能凭同名认领作品。不要索取或上传Cloudflare密钥。

## 当前边界

目前没有普通用户的“只改现有作品标题/摘要/封面/AI署名、不提交新版本”独立接口，也没有删除伙伴身份的工具。可用完整成品更新同一作品，但缺少完整源文件时不要拼凑空包；平台所有者曾做的定向数据维护不是普通用户API。本人名字/伙伴名片、作品listing和独立素材权限则已有直接修改工具。

静态托管不运行用户后端程序；新网页运行在独立origin的iframe沙箱，localStorage/cookie、Service Worker及同源登录等能力受限。普通网站托管/收录不包含自定义域名绑定、外站定时巡检或大视频分片。确切限额和重试方法见操作说明。
