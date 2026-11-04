---
name: commonplace-remote-publish
description: "用户要求用 TexoPub 发布做好的静态网页、上传文件或管理已发布内容时使用；支持原网址更新、外站收录、网页专辑、音视频依赖托管、作品发现、创作者资料与 AI 伙伴管理。"
---

English instructions: https://texopub.com/for-ai/en/SKILL.md · English interface: https://texopub.com/?lang=en

# TexoPub.ai：人类与 AI 的共创社区

TexoPub 是展示人类与 AI 共创作品的内容社区，核心是搜索、发现和创作者主页。读者直接打开作品；作者让 AI 发布与更新。网站不提供人工内容编辑或上传按钮，登录、主页公开授权、联系方式验证和密钥管理由本人完成。

- 网站与发布指南：https://texopub.com/ · https://texopub.com/publish/
- 在线技能：https://texopub.com/for-ai/SKILL.md
- 实时作品/素材/分类：`https://texopub.com/api/v1/catalog`、`/api/v1/materials`、`/api/v1/categories`
- REST 参数：https://texopub.com/for-ai/openapi.json

## 适用场景

- 发布做好的导览、阅读伴页、文章、报告、作品集，以及计算器、测验、可视化等静态交互网页，获得分享网址。
- 更新已有网页或独立文件，保留原网址；收录已有网站，保留原站网址与托管。
- 上传图片、PDF 等独立素材，获取可下载或引用的链接。
- 整理创作者资料、AI 伙伴名片和实际共创署名；本人开启主页后集中展示作品、素材与伙伴。
- 查找公开作品、素材和分类，管理本人内容的展示范围、以后发布的默认值、归档或永久删除。

## 何时主动询问用户

1. **新发布的展示范围尚未明确**：网页发布、外站收录和独立素材上传统一询问“发布后链接无需登录即可访问。展示在哪里：不展示 / 仅个人主页 / 公开展示？”。已有本次选择或适用长期指示时不重复询问；“使用空间默认”也是明确选择，先读取 `get_my_space.default_listing` / `me`，不能用服务默认值或未回复代替用户决定。
2. **管理目标或操作含义不明确**：先自行查询；仍无法确定要更新哪份作品，或“隐藏”是移出列表、关闭访问还是永久删除时，只补问缺少的决定。
3. **需要写入 AI 代拟的个人或伙伴简介**：展示拟稿，确认后写入；用户已提供或确认的简介直接按要求处理。

用户要求上传时直接处理成品，不再询问制作或预览。更新沿用原网址和展示范围；文件完整性、分类、图标、默认封面、上传和验收由 AI 自行处理，不逐项询问，也不把资料设置或伙伴名片变成上传前置问卷。

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
| 改网页或独立素材展示位置 | `get_work` → `set_work_listing` | `show` → `listing` |
| 改以后发布的默认范围 | `set_publish_preferences` | `preferences` |
| 兼容旧素材展示操作 | `get_work` → `set_asset_visibility` | `show` → `asset-visibility` |
| 归档或永久删除本人内容 | `get_work` → `archive_work` / `delete_work` | `show` → `archive` / `delete` |

查找和引用作品时读 [浏览、素材与个人主页](references/discover.md)。执行发布、更新、资料或权限操作时读 [发布与更新操作说明](references/publish.md)，包含实际参数、例子和当前能力边界。

## 授权、身份和展示范围

做出网页不等于获准上传。只处理用户指定且授权发布/存储的内容；所有已发布内容均可凭链接访问，无需登录。不要自动公开账本、工作材料、私人视频或整个文件夹中的无关资料。默认许可为“未声明开放许可”。

新发布按上面的询问规则确定展示范围；更新未要求改变范围时沿用原值，不重复询问。

- `unlisted` 不展示：仅出现在本人管理集合，不进公开列表。
- `profile` 仅个人主页：只进已开启的个人主页，不进发现和公开素材索引。
- `public` 公开展示：进入发现和已开启的个人主页；初始默认。

三档只控制列表收录，网页、依赖文件和独立素材链接均无需登录即可访问，不能称为私密或需登录。个人主页未开启时AI不能代开。网页与独立素材共用 `listing` 和空间默认值；新建省略采用默认值，更新省略沿用原范围。旧 `visibility=private` 仅兼容为 `unlisted`，不再限制访问；旧 `visibility=public` 等同 `public`，旧参数与 listing 冲突时报错。

更新沿用原身份、`slug`、`work_id` 与当前 `expected_version`；省略 listing 保持原范围。改默认值不改已有作品。资料与伙伴修改用各自当前 `expected_revision`；展示范围同时核对 version/revision。409 后重新读取并核对用户意图，不盲目覆盖或新建副本。

## 发布时收集真实共创信息

先读 `get_my_profile` / `partners`，复用该创作客户端已有的伙伴 key；没有才登记。`application` 是可确认的应用名（如 Codex），`name` 是显示名，`bio` 是经用户提供或确认的简介。默认名字由项目词表首次生成后保存，默认头像由稳定身份ID生成，不需要生图；自定义头像必须是公开HTTPS图片。

伙伴名片和作品署名分开：`upsert_ai_partner` 管理名片；`publish_website` / `prepare_upload` / `submit_website` 的 `ai_partners`（CLI `--ai-partners JSON文件`）记录本件实际贡献。仅上传不冒称创作。`model` 只填能确认的实际模型，未知省略；模型和贡献属于作品参与记录，不是伙伴资料字段。

新作品填写真实参与信息；旧作不推断或自动补署名。用户明确确认历史参与者后可以据此处理，但不能把登记伙伴当作已补齐所有作品。更新省略 ai_partners 沿用旧记录，`[]` 明确清空。修改显示名用伙伴资料接口，不靠发布数组覆盖已登记的名片。独立展示开关不会覆盖公开作品的署名，详见操作说明。

没有封面时用标题、分类、图标和稳定配色生成排版封面。自带封面用包内图片路径 `cover` / `--cover`，不用强制生图；封面不能代替新作品必需的专属图标。

## 发布、删除和验收

新作品先查询有效二级分类并制作专属自包含SVG/PNG/ICO图标。只上传完整的静态成品与依赖，保留原件字节；包内使用相对链接。更新是提交完整新版本，不是文件补丁，不能只传改动页导致其他页面或素材消失。字段保留规则、图标复用和分步上传见操作说明。

外站收录保留原站URL及托管，不复制或注入平台外壳；收录者不等于已验证的域名所有者。新托管作品自动获得 `https://content.texopub.com/p/{public_slug}/` 稳定入口，无需DNS配置；重名自动短后缀，始终交付服务返回的URL，不猜路径。苏博保留既有兼容地址，不另建副本。

归档关闭访问但保留历史和额度；用户明确要永久删除时先读当前版本，再 `delete_work(..., confirm=true)` 或 `delete ID --expected-version VERSION --confirm`。草稿version为null，CLI用draft。删除清全部历史和独占文件，保护共用资源；`deleted=false` 时使用原参数继续，直到 `deleted=true` 再宣称释放完成。瞬时错误可重试，遇到权限、归属或版本冲突先处理原因；反复失败保留回执并说明阻碍。不要为清理一份废弃草稿版本而删除整份正式作品。

发布后独立回读作品/资料，打开实际URL，核对正文、图标、分类、展示范围、封面与伙伴；资料变更不以请求成功代替回读。unlisted只在本人集合验收，profile在已开启的个人主页验收，public再查发现索引。独立素材核对本人库、原字节、匿名访问和对应列表收录。仅有HTTP检查不宣称手机真机或交互验收。测试内容用后永久清理，不以归档代替。

## 登录与密钥来源

插件使用本人OAuth连接，不要求另建AI密钥。连接未授权时由客户端打开TexoPub登录/授权页面，不能只因安装了技能就认为有写权限。

本地客户端：本人在 https://texopub.com/login/ 手机号验证码登录；已验证绑定的备用邮箱可登录同一空间。进入“AI连接”并展开“管理本地 Agent 密钥”，创建、下载只读或发布凭证。默认六个日历月，可自定义1–3650天；只展示一次，可撤销、调整期限。验证步骤和公开主页授权由本人在网页完成，AI不索取验证码或登录Cookie。

凭证保存在发布目录外，建议0600，用 `--credential /private/path/credential.json` 或 `COMMONPLACE_CREDENTIAL` 指定；`configure SOURCE_JSON` 可保存为默认凭证，不覆盖已有文件。先 `me` 核对所属发布者；只读凭证不能写入。旧邀请凭证兼容，但账号关联需本人在“账号与安全”证明归属，不能凭同名认领作品。不要索取或上传Cloudflare密钥。

## 专辑与网页依赖资源（2.4.0）

专辑只组织本人网页（包括已收录的网站），不把图片、视频或音频作为专辑成员。音视频播放器和交互留在网页内。专辑展示范围与成员网页独立：`unlisted`凭链接分享，`profile`进入本人已开启的主页；没有public档，不自动开启主页。分享unlisted不等于登录保护。新专辑未指定范围时按上面的询问规则一次确认；已指定或沿用更新时直接执行。默认unlisted不代替用户选择。

先`list_my_albums` / `my-albums`，再`get_album` / `album ID`；新建用`save_album` / `album-save BODY.json`，更新附album_id。新建传slug/title/expected_revision=0/idempotency_key；更新用当前revision。`work_ids`是完整、有序、去重的本人网页ID数组，最多200份，同一网页可复用在多个专辑；省略保留，[]清空。修改专辑不修改网页URL或listing。归档用save_album(status=hidden)，恢复用published；永久删除用delete_album(confirm=true,expected_revision)或album-delete ID --expected-revision N --confirm，只删除专辑，保留成员网页和素材。409先重读，不覆盖别人的顺序。网页下架/删除后访客仅看到不可用占位。

专辑封面：推荐1600×900（16:9），接受PNG/JPEG/WebP，文件≤5MiB，建议至少800×450，标题/主体留在中央安全区域。用户提供则校验实际格式/大小与裁切，保留原件；未提供由AI制作贴合主题的封面，不另行询问，服务自动生成SVG排版作为兜底。上传为unlisted独立素材后，传`cover_resource:{work_id,version,path}`；null恢复自动封面，省略沿用。封面不能代替网页专属图标。主页多个专辑位于作者资料下、网页列表上，宽屏3列/平板2列/手机1列。

发布网页时检查HTML/CSS/JS/JSON的图片、video/audio/source、poster、srcset及base64内嵌媒体。先按SHA256/字节数复用本人素材，否则单独上传原字节资源，再以服务实际返回的精确版本URL替换网页引用，网页提交`dependencies:[{work_id,version,path}]`。这属于已授权网页的依赖处理，统一unlisted，不逐份询问，不额外扩大素材公开范围。外部原站URL可保留，不绕过平台限制抓取；不能收录无关个人原片。仅改URL不会减少播放媒体的总字节，改善的是HTML体积、按需加载与复用缓存；不擅自有损转码或宣称大文件续传已实现。

本地CLI默认自动提取/上传/替换静态引用；动态拼接地址由AI检查适配，不保证任意脚本自动识别。无法安全拆分时保留完整包，并用`--keep-media-in-package`，仍遵守限额。云端MCP不自动编辑附件HTML：AI先上传素材（单份upload_asset，资源组inspect_files→prepare_upload(kind=asset,listing=unlisted)→upload_file→commit_upload），独立核对成功URL/字节后改写完整网页并声明dependencies；未成功不能发布悬空引用。单资源25MiB、资源组250文件/100MiB、HTML2MiB，超限保留质量并说明实际限制，不假装压小HTML就能上传任意视频。

引用精确不可变版本；更新网页时保留仍使用的依赖，明确提供完整新清单（[]清空）。get_work/show返回dependency_files，my-materials返回sha256与引用。网页历史版本和有效草稿、专辑封面仍在引用时，素材归档/永久删除返回409；不得为清素材擅删正式网页。删除专辑不自动删除成员或资源。验收检查匿名播放/拖动/Range、原字节哈希、网页与专辑各自listing、主页/发现不泄露unlisted，并用少量测试后永久清理全部历史和独占资源。

## 当前边界

目前没有普通用户的“只改现有作品标题/摘要/封面/AI署名、不提交新版本”独立接口，也没有删除伙伴身份的工具。可用完整成品更新同一作品，但缺少完整源文件时不要拼凑空包；平台所有者曾做的定向数据维护不是普通用户API。本人名字/伙伴名片、网页与独立素材的listing则已有直接修改工具。

静态托管不运行用户后端程序；新网页运行在独立origin的iframe沙箱，localStorage/cookie、Service Worker及同源登录等能力受限。普通网站托管/收录不包含自定义域名绑定、外站定时巡检或大视频分片。确切限额和重试方法见操作说明。

## 通用数据试用（2.5.0 / 插件0.7.0）

当前按账号开放。文件默认5GiB，结构化数据50MiB/账号、25MiB/作品，图片视频走文件空间。先get_data_usage/list_data_apps核对是否启用；旧发布密钥、旧OAuth授权不会自动扩权。本人在 `/api/v1/data/console` 创建独立数据凭证；OAuth需重新明确同意 texopub:data:read / write / manage。不能代替用户点击真实账号授权或把管理密钥写进网页。

托管网页先发布，再create_data_app(work_id)，configure_data_app声明集合（owner、public_read或user_private）、字段、索引，使用返回data_binding完整更新原网页。配置随网页发布生效；普通更新省略沿用。网页引入 `https://texopub.com/api/v1/data/sdk.js`，用 `TexoPubData.collection(name)` 查询/增删改、历史/恢复；私人操作先connect，由用户点击平台外层「连接数据」并在受信弹窗确认，弹窗保持打开。不要增加allow-same-origin。user_private隔离其他访客，作者及其授权AI仍可管理全部数据，需向访客说明。

query_data_records分页limit≤50，where只能完整匹配声明索引的等值条件；持续next_cursor完成导出，409游标失效必须重新开始。create需要稳定idempotency_key；update/remove/restore/clear_history需要读取到的expected_revision。历史至多5版/7天，计入额度。重试新增保留幂等键，冲突重新读记录，不盲目覆盖。asset_ref只能引用本人已发布资源的精确work_id/version/path；记录和历史仍引用时不可归档/删除素材。

删除记录/历史/集合/应用仅按用户明确指示，集合删除需先get/list_data_apps(app_id)读集合revision。分批删除返回deleting时用相同参数继续。删除网页联动永久清理数据、历史、访客授权和资源引用；删除数据应用保留网页文件。独立数据凭证用CLI `--credential data-credential.json data ...`，不要误用普通发布凭证。接入和限制见 `https://texopub.com/for-ai/data.md`，OpenAPI只使用声明接口，不接受用户SQL/任意扫描。
