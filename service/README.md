# 共创社区正式接入（Skill 2.1.0 / MCP 0.3.0）

正式前端为 `templates/community/`，读取实时目录与本人空间。内容、资料、封面、展示范围及素材权限交给AI处理；页面底部只说明当前页可更新的内容。手机号/邮箱验证、个人主页授权、密钥与应用连接由本人操作。登录和权限沿用既有账号，不改变已有作品范围或网址。

## 共创社区与资料更新（v2.1.0）

网站以搜索、作品封面和创作者主页为中心。内容和资料在 AI 中修改，网页只提供当前页的简短说明；登录、公开主页授权、密钥与联系方式验证仍由本人完成，不向用户索取验证码或登录 Cookie。

- 先用 `profile` / `get_my_profile` 读取资料和 revision。用 `profile-update --expected-revision N` 或 `update_my_profile` 修改名字、头像和已获确认的简介；只传要改的字段，冲突后重新读取，不直接覆盖。name=null（CLI `--reset-name`）恢复固定默认名，avatar_url="" 恢复默认头像，bio="" 明确清空简介。主页开关不在 AI 接口中。
- 默认中文名由项目原创词表生成并保存，词表升级不重命名已有用户；头像按身份ID生成。自定义头像需公开HTTPS图片，不能用鉴权私有素材链接。简介默认空，只有用户提供或确认后才写入。
- 用 `partners` 查看伙伴，或 `partner --key codex --application Codex --expected-revision 0` / `upsert_ai_partner` 新建。key在所属空间固定；新建revision=0，更新用实际revision。名称默认可确认的应用名，不猜具体模型；伙伴昵称、简介和自定义头像的改动遵循用户要求。`show_on_profile` 仅在用户明确要求展示该伙伴时设置，不会开启主页。
- 发布时通过 `--ai-partners /path/to/contributors.json` / `ai_partners` 自报本件真实参与信息。例如 `[{"key":"codex","application":"Codex","contribution":"编写网页与交互"}]`。可以填写可确认的 `model`；未知则省略，不写“模型未提供”。单纯上传只记录上传，不冒称创作。信息是自报，不代表模型认证；旧作品不自动补署名。更新省略数组沿用原记录，空数组明确清空。
- 没有封面时平台使用标题、分类、图标与配色排版兜底，不必生图。已有封面可用包内 `--cover` / `cover` 图片路径；原文件按字节保存。
- 现有网站使用 CLI `submit` 或插件 `submit_website` 收录，保留原站地址及托管；不复制原站。独立素材改权限时，先 `show` / `get_work`，再用 `asset-visibility WORK_ID --expected-version VERSION --expected-revision N --visibility private|public` / `set_asset_visibility`。只有用户明确同意公开时设public；不能用于网页依赖文件。

新增迁移 `0007_community.sql` 为资料修订和伙伴表增列。默认词表 `identity-lexicon.json` 是项目原创草案，生成名字后保存；仅迁移空白及“新创作者”占位名。旧作品没有伙伴记录时不推断署名。AI资料写入和素材权限使用revision/version校验，公开主页不能由AI开启。

MCP共20工具，新增get_my_profile、update_my_profile、upsert_ai_partner、submit_website、set_asset_visibility；既有读/发布scope保持。通用包0.3.0，现有个人应用同身份更新包1.2.0。工具部署后刷新既有连接并在新对话实际调用；不能只凭包版本宣称客户端已同步。以下早期上线记录保留为历史，当前界面以本节为准。

# 永久删除与作品展示范围（v2.0.0 / MCP 0.2.0，2026-10-26）

## 展示范围与永久删除（v2.0.0）

每次发布前，用一句话询问：「展示在哪里？不展示 / 仅个人主页 / 公开展示（默认）。」先用 `me` / `get_my_space` 读取 `default_listing` 作为默认建议；用户已经在本次请求中选择、或给过适用的长期指示时，直接执行，不重复询问。用户只说“默认”时使用其空间默认值。没有回答且没有既有选择或授权规则时，不把默认选项当成已确认；兼容客户端省略参数仍使用服务默认值。

- `unlisted` **不展示**：只出现在自己的管理页，不进入任何公开列表。
- `profile` **仅个人主页**：出现在已开启的个人主页，不进入 TexoPub 发现列表及公开素材索引。
- `public` **公开展示**：个人主页和 TexoPub 发现列表都展示；初始默认值。

三档控制收录位置，链接及网页依赖均可直接访问；“不展示”不是加密、私密访问或登录保护。个人主页未开启时不自动开启。独立素材的 `private/public` 权限保持原规则，不要和网页 `listing` 混淆。

发布/收录传 `--listing unlisted|profile|public`（插件 `publish_website` / `prepare_upload` 同名字段）。更新省略 listing 保持该作品原范围，不因默认值改变而扩大展示。可以不上传新版本，使用插件 `set_work_listing`，或客户端 `listing WORK_ID --expected-version VERSION --expected-revision REVISION --listing profile`；操作前读取 `show` / `get_work` 的当前版本和revision，冲突时刷新。

用户要求更改以后的默认值时，客户端 `preferences --default-listing profile` 或插件 `set_publish_preferences`。默认值保存到所属空间，由AI按用户要求修改；不改已有作品。改变默认值不等于用户要求省略每次发布询问，只有明确长期指示才省略。

永久删除仅在用户明确要求时执行，不用归档代替删除。先读取当前版本，再用插件 `delete_work(work_id, expected_version, confirm=true)`，或客户端 `delete WORK_ID --expected-version VERSION --confirm`。未提交草稿的版本为 null，CLI 用 `--expected-version draft`。删除不可恢复；关闭作品和历史链接，清除所有历史版本及不被其他内容引用的文件，完成后释放额度。返回 `deleted=false,deleting=true` 表示仍在清理，继续使用相同参数，直到 `deleted=true`；失败也用原参数重试，不宣称已经完成。地址占用记录保留，旧短网址不会指向别人的内容。外部收录只删本站记录和图标，不影响原站。

让AI处理本人作品和独立素材的删除，网页不提供手动内容管理。网页依赖属于整份作品，不能在素材卡中误删整份作品。`archive` 仍只下架保留数据和额度。测试内容验收后永久删除并核实目录、本人列表、旧链接和额度，只保留少量本地证据。


# TexoPub 云端 MCP / 插件测试版（v0.1.4，2026-10-23）

## 插件工具更新验收

插件包/Skill版本与ChatGPT连接缓存的MCP工具清单分别更新。更改工具名称、参数、说明或annotations后，按[官方连接文档](https://developers.openai.com/plugins/deploy/connect-chatgpt)部署服务，在现有插件连接管理页点击「刷新工具」，然后新建对话验收；原对话可能保留旧工具集合，不能凭原对话缺少工具判断服务未部署。无需因此删除应用或扩大OAuth权限。

先核对新对话实际工具清单与服务端一致，再实际调用受影响工具，并独立回读关键状态。删除工具可先对不存在的测试ID做404路由验证，不影响真实内容；这不能代替删除及存储释放的完整功能验收。发布收尾须分别记录服务器功能、连接工具同步、客户端实际调用和手机验证的证据范围。不能把ZIP上传成功、Skill出现新文字或刷新按钮恢复视为全部验收完成。

2026-10-26已在既有个人连接刷新后的新对话调用`set_work_listing`成功：家庭药箱保持unlisted，revision由1变2，正文版本未变；`delete_work`针对全零不存在ID返回404。证据`evidence/plugin-tool-sync-20261026/`；删除功能完整验收另见`evidence/lifecycle-20261026/`。

- MCP 稳定地址：`https://texopub.com/api/mcp`；部署复用 API Worker，内容 Worker 未更改。使用官方 MCP TypeScript SDK 1.32.1 的 Web Standard Streamable HTTP，无会话、JSON 响应，每次请求新建服务；无本机脚本依赖。
- 15个工具：`list_categories`、`get_my_space`、`list_my_works`、`get_work`、`list_my_materials`、`publish_website`、`upload_asset`、`archive_work`、`inspect_files`、`prepare_upload`、`upload_file`、`commit_upload`、`set_work_listing`、`set_publish_preferences`、`delete_work`。全部须 OAuth；分类另有原公开HTTP入口。写入复用现有校验/上传/提交/版本和权限流程，不能传管理路径或跨空间身份。
- OAuth issuer 为现有 API 域；`/.well-known/oauth-protected-resource` 绑定 resource=`https://texopub.com/api/mcp`，`/.well-known/oauth-authorization-server` 提供发现。浏览器授权在主站 `/api/oauth/authorize`；原登录页仅允许本站这条精确路径及连接管理路径作为 next。S256 PKCE、一次性5分钟code、绑定账号会话10分钟consent、resource/client/redirect校验；支持动态注册公共客户端与固定ChatGPT预注册公共客户端（不宣称动态CIMD支持），回调只接受ChatGPT正式路径或Codex loopback路径。
- `migrations/0005_plugin_oauth.sql` 仅增五表/两索引；不修改旧记录。服务只保存code/token摘要。access 1小时、refresh最长30天/轮换/重复使用撤销整组、连接最长180天；账号撤销或插件连接撤销立即拒绝。scope=`texopub:read texopub:publish`，发布令牌不能登录账号管理接口；原密钥也不能代替MCP OAuth。
- 授权及撤销在 `https://texopub.com/api/oauth/connections`，设置页已有入口。授权页显示所连空间、权限和公开范围。验证码由用户在本站原登录页完成，不将用户Cookie或AI密钥交给ChatGPT。连接不会返回电话/邮箱或账号设置。
- 插件接受直接HTML/文本文件和ChatGPT授权fileParams附件（附件路径与其顺序对齐）。文件下载仅允许OpenAI文件/CDN域及Azure Blob服务域，重定向逐次核对，不附带本站Cookie/令牌；有20秒超时及读取字节上限。一键发布最多8文件、单文件25MiB、总32MiB、请求3MiB、HTML2MiB；超过8文件使用inspect_files分批校验、prepare_upload建完整清单、upload_file逐份上传、commit_upload最终提交，支持250文件/100MiB。每次分步请求单独授权/校验，避免免费D1每次50查询上限；不购买或升级服务。ZIP/框架源码须先静态导出，不能把本机路径或sandbox:链接当远程文件。
- 新网页仍需二级分类/专属图标；更新校验work_id与expected_version，沿用短网址和原图标。重复同版本请求使用同幂等键；完整文件集合到齐才提交。独立素材默认私有，不伪装为匿名资源。
- 插件源码 `service/plugin/`，运行 `python3 scripts/package_plugin.py` 输出七文件白名单 ZIP 和 `/plugin-manifest.json`；仅含通用/兼容manifest、MCP URL、发布Skill和标志，无凭证/脚本。两份标准JSON分别通过Agent Plugins 1.0 schema，另提供当前Codex CLI需要的.codex-plugin/.mcp兼容格式；MCP配置使用标准schema允许字段，由OAuth发现/客户端连接表单选择认证。OpenAI文档的auth扩展当前不被外部标准schema接受，因此未混入标准mcp.json。
- 个人已连接ChatGPT插件更新单独使用 `python3 scripts/package_connected_plugin.py --identity-zip <从该插件下载的原ZIP> --version <新版本> --display-name TexoPub --output <专用更新ZIP> --receipt <验收JSON>`，从原ZIP读取精确dev内部name及.app ID；必须显式提供身份ZIP/版本，不将个人映射放入通用下载包。当前有效个人插件ID、图标替换与旧版卸载状态见任务进度文首。
- 插件说明/下载 `https://texopub.com/plugins/texopub/`。公共目录上架与手机实际使用须单独完成，不能以包生成/协议测试冒充已上架。当前部署及验收证据见 `evidence/texopub-plugin-20261023/` 和任务进度文首。

# 通用短地址与带域名部署（v1.9.0，2026-10-23）

所有普通托管网页在创建上传会话时自动获得 `works.public_slug`，全站唯一索引保证并发安全；先使用请求slug，冲突或保留名称自动加短后缀，原作品更新不重新分配，下架不释放。API提交/查询/目录统一返回 `https://content.texopub.com/p/{public_slug}/`。内容Worker按数据库解析短路径，草稿/下架/私有素材不可公开。旧带publisher_id路径与workers.dev继续读取，苏博旧兼容入口保留。原按作品写死的work-aliases.json已移除，川大也使用数据库字段。

`short-urls.mjs`为分配候选规则；`0004_public_slugs.sql`仅新增列和唯一索引。升级旧库后，按创建时间为已有非下架的托管作品用同一候选规则回填，已有公开短名必须保持；不为外站和私有素材分配。全新库的schema.sql与schema-statements.json已同步。普通AI只需按公开Skill使用publish，不需要域名/DNS权限或额外参数。

# 个人空间、短信登录与密钥管理（v1.7.0 已上线并完成验收）

代码已部署，主站 `/api/v1/auth/status` 已返回两通道配置就绪；实际短信登录、备用邮箱验证绑定已成功；新密钥浏览器创建/下载、真实客户端使用、隔离及撤销均已通过；邮箱回登录已由用户完成，服务端确认进入原空间。公网私有素材上传/更新/归档及双身份隔离已通过。具体状态以项目任务进度为准。本节替代后面的旧邀请制默认流程；下方旧部署证据保留为历史。账号前台 `/space/`，公开主页 `/u/{publisher_id}/`。手机号首次验证码验证创建账号；备用邮箱仅在已登录且近期验证后绑定，邮箱登录只能进入已有空间。

- `accounts.mjs`：同源安全 Cookie 会话（30天）、CSRF、5分钟/5次验证码、每号码每分钟/每日及IP/全站限流、独立有期限/可撤销/只读密钥、旧身份凭证证明、换绑与全设备退出。
- `providers.mjs`：阿里云号码认证 `SendSmsVerifyCode` / `CheckSmsVerifyCode`（仅以 `Model.VerifyResult=PASS` 成功，检查OutId），DirectMail `SingleSendMail` 备用邮箱发送。Web Crypto RPC签名通过官方测试向量。不会返回或记录短信验证码。
- `migrations/0002_accounts.sql`：只增表与索引，不覆盖旧发布者和作品。旧日常密钥继续有效，可登录后证明旧身份归属、创建新密钥并撤销旧key；不能按同名认领内容。
- 新 `kind=asset` 默认私有，版本/稳定文件下载都经所属账号鉴权，主内容域匿名读取拒绝。网页依赖仍公开；已有公开记录没有visibility字段时保持公开。
- 浏览器账号API仅在 `APP_ORIGIN` 接受，变更须 `Origin` 匹配及 `X-TexoPub-Request: space`。通过主站 `/api/*` Worker route 提供同源服务；普通Bearer密钥不能管理账号。
- 初始 `SMS_TOTAL_LIMIT=1000` 为整站累计发送上限（按请求保守计数，包括失败），默认 `SMS_DAILY_LIMIT=100`；邮件另以 `MAIL_TOTAL_LIMIT=2000`、`MAIL_DAILY_LIMIT=100` 限制，预算标识 `MAIL_BUDGET_ID`；达到上限停止发送，不自动续购。预算重置必须在确认新额度后使用新 `SMS_BUDGET_ID`。云厂商自己的测试短信或其他应用不在此计数内，实际账户资金限制仍由所有者管理。
- 当前使用个人免资质 PNVS 赠送签名【恒创联众】及模板 100001，官方限制不能修改签名/模板。要使用品牌签名须另走合规资质、签名审核与对应服务接入，不能直接替换 SMS_SIGN_NAME。个人指南：https://help.aliyun.com/zh/pnvs/use-cases/sms-verify-for-individual-developers
- 阿里云 runtime RAM仅需 `dypns:SendSmsVerifyCode`、`dypns:CheckSmsVerifyCode`、`dm:SingleSendMail`，不应授予管理员权限。秘密仅置于Worker秘密绑定，不能加入仓库、站点、Skill或日志。 `AUTH_PEPPER` 用于邮件OTP摘要及限流键。
- 配置项：`APP_ORIGIN=https://texopub.com`、`API_ORIGIN`（原API域）、`SMS_SIGN_NAME`（控制台赠送）、`SMS_TEMPLATE_CODE=100001`、`MAIL_FROM`、`MAIL_REGION=cn-hangzhou`、`MAIL_ENDPOINT=https://dm.aliyuncs.com/`。秘密 `ALIYUN_ACCESS_KEY_ID/SECRET`；可选独立 `MAIL_ACCESS_KEY_ID/SECRET`。
- 真实接入前使用Miniflare outboundService模拟阿里响应，生产代码没有测试OTP、调试登录接口或可启用的认证旁路。

# 历史：邀请制云端发布服务（账号接入前基线）

2026-10-22已上线。对外入口：https://texopub.com/for-ai/

- API：`https://commonplace-api.ivanliyuanning123.workers.dev`
- 独立内容来源：`https://commonplace-content.ivanliyuanning123.workers.dev`
- R2 Standard私有桶：`commonplace-library-files`
- D1：`commonplace-library`，ID见 `deployment.json`。
- `worker.mjs`：两个Worker共用源码，`ROLE=api`负责上传与索引，`ROLE=content`只读公开版本。通过D1/R2 bindings访问资源，无S3存储密钥。
- `schema.sql`：表和配额触发器；`schema-statements.json`为逐条DDL测试输入。
- `legacy.json`：原苏博和101份素材的只读公开基线，不含本地路径；后续新作品及版本由D1负责。
- `taxonomy.json`：API分类快照；修改根目录分类时应同步并重新部署后端。
- `skill/commonplace-remote-publish/`：公开Skill源文件、浏览与发布说明、独立客户端。它介绍产品、部署与使用方式，并邀请共创，不包含任何凭证。
- `public/`：公开Skill、OpenAPI、客户端下载与ZIP，由Pages构建复制。修改后运行 `python3 scripts/package_public_skill.py`，按固定4文件白名单生成版本包及SHA256清单；客户端自动从 `scripts/remote_publish.py` 同步。禁止整体打包项目目录。
- `/publish/` 与 `/for-ai/`：由 `templates/community/` 和 `scripts/library.py` 生成静态AI接入指南，无复制或人工文件上传控件。当前固定版ZIP由 `/for-ai/manifest.json` 声明（以 manifest 实际版本为准），稳定地址为 `/downloads/commonplace-skill.zip`。

## 外部网站收录

`commonplace remote submit HTTPS_URL --slug existing-site --title '标题' --summary '用途' --category technology/software --icon /path/to/icon.svg --format tool`。使用个人发布密钥（兼容旧邀请凭证），复用上传、校验和提交接口；`kind=work, source=external`，仅上传图标。原站HTML、服务器、域名及交互均保持在原站；目录直接跳转，不套平台外壳。当前不验证域名所有权、不自动探测链接，不允许把现有托管记录改成外部收录。

支持receipt加`--update`；`show WORK_ID`读取最新版本；`withdraw WORK_ID --expected-version VERSION`由所属发布者移除，管理员仍可hide。`--link-status unavailable`是收录者标记，不是平台探测结果。移除不影响原站，不释放历史配额。外部图标不进入素材目录。

迁移 `service/migrations/0001_external_sites.sql` 只增加已公开外部URL的唯一索引，不改表或旧记录；新环境schema及schema-statements已包含。URL片段保留在链接里，但去片段后的规范化地址用于防止并发重复收录。

## 身份与邀请

所有者管理令牌在项目 `.secrets/admin.json`，日常发布身份在 `.secrets/owner-publisher.json`，均0600。不要输出令牌，不得提交或部署 `.secrets`。后端只配置管理令牌SHA256；发布者令牌同样只存SHA256于D1。

```sh
commonplace remote me
commonplace remote --credential /Users/liyuanning/文稿/共创书架/.secrets/admin.json invite --name '发布者名称' --output /private/path/credential.json
commonplace remote --credential /Users/liyuanning/文稿/共创书架/.secrets/admin.json revoke PUBLISHER_ID
commonplace remote --credential /Users/liyuanning/文稿/共创书架/.secrets/admin.json hide WORK_ID
```

只在用户明确邀请某人时创建其凭证，不擅自发送。所有者发布默认读取其发布身份，管理操作需显式指定admin。独立远程客户端只需要Python3、HTTP与邀请凭证，不需要Wrangler/Cloudflare登录。

## 开发与发布

```sh
node --test service/tests/service.test.cjs
python3 scripts/package_public_skill.py
commonplace build
node --test service/tests/cloud-directory.test.cjs tests/ai-publish.test.cjs
python3 -m unittest discover -s tests -v
node tests/directory.test.cjs
```

后端测试调用本机固定版本的esbuild/Miniflare，运行真实workerd、SQLite/D1和R2模拟存储，并验证独立Python客户端。用esbuild的 `.html=text` loader打包共享 `templates/work-viewer.html` 和 `templates/work-bridge.html`，生成 `worker.bundle.mjs`；此文件只含公开代码、分类和原案例公开索引，不含凭证。

本次后端部署通过已授权Cloudflare官方连接完成，无需扩大原Wrangler OAuth权限。API操作流程：验证账户和已有资源 → 建R2桶与D1 → `/d1/database/{id}/query`执行schema → multipart上传两个Worker（main_module=worker.mjs、compatibility_date=2026-10-22、DB D1绑定、FILES R2绑定、ROLE、CONTENT_ORIGIN；只有API角色配置ADMIN_TOKEN_SHA256）→ 启用两者workers.dev路由且关闭预览路由。未创建或升级Workers付费订阅。

首页维护仅部署 `build/current/site`，不覆盖D1。发布前备份当前页面并核对资源，使用现有Pages权限及官方Wrangler进行 `pages deploy --project-name co-created-library-lyn --branch main`。目录JSON重定向到云端，任何旧全量发布流程均已拦截。`publication-state.json`旧catalog哈希仅作为历史记录，云端模式不能用它覆盖新目录。

## 验证证据

`evidence/service-rollout-20261022/`：真实公网独立身份发布、更新、素材、拒绝匿名上传、测试下架和凭证撤销记录；此前页面备份在 `frontend-before/`。

验证脚本 `scripts/verify_service_live.py` 使用指定测试发布者。该测试身份在第一次验证后已撤销，重跑必须由所有者创建一个新的专用测试身份并替换验证凭证文件，不能解除已撤销凭证。脚本结束时下架测试作品并撤销测试凭证，不保留假作品填充导航。

## 明确边界

- 当前版本采用手机验证码自助注册、绑定邮箱备用；不含付费、社交登录或MCP。接入是否上线以文首及任务进度为准。
- 第一版由Worker接收单文件上传；25MiB/文件、100MiB/会话、250文件、HTML2MiB、图标1MiB。大视频分片/临时直传尚未实现，不有损重编码绕过。
- 默认512MiB/发布者预留额度，含历史版本和草稿；20次新会话/日。草稿24小时后不再允许提交，但不会自动释放配额或清理对象；管理员后续可增加受控清理流程。不能把过期会话当成已回收空间。
- 新网页响应CSP sandbox且不允许same-origin；同源存储、Service Worker和部分页面能力受限。原苏博走原Pages URL，交互不受这套沙箱更改。
- 文件路径要求相对路径；JS硬编码根路径以及复杂构建产物须预先适配。已有内嵌图片的常见base64形式可提取，其他动态依赖不声称自动识别全部。
- 导航最多1000个云端网页条目、素材最多2000个当前版本文件；超出前需分页。
- 已知案例的只读基线不是D1已完成迁移；苏博更新需单独迁移并保持其原URL，不另建同名作品。
- 尚未有真实第三方用户的AI试用，也没有物理关闭Mac验收；公网测试使用另一专属身份与纯HTTP客户端，不依赖本机发布器运行。
- 后端初次上线时IAB连接超时；后续AI发布入口已在IAB实际核验桌面布局与复制反馈，证据见 `evidence/skill-onboarding-20261022/`。尚未完成手机设备视觉验收。

## 平台标题栏与作品隔离

内容Worker的/p/与/v/HTML入口提供独立 `templates/work-viewer.html`，左主页图标、居中HTML标题，下滑收起/上滑恢复。作品在下方无allow-same-origin的iframe沙箱中加载；/_texopub/content/v/...为内部文件来源（同样检查公开状态与沙箱CSP），base改为内部版本根，追加 `templates/work-bridge.html` 只报告标题/滚动/同作品位置。平台只接受当前iframe窗口消息，标题使用textContent，网址同步需匹配作品命名空间。非HTML素材范围请求与字节不变。原R2文件不重写，外壳/桥接HTML no-store，忽略HTML Range并返回完整200；外壳字符串可由运行时设置正确Content-Length，不能沿用存储对象长度/ETag。

旧本机所有者静态作品构建同样外壳，内容在/p/{id}/_content/下，保留已有存储及交互能力；不将这种信任扩展给云端上传作品。大字/目录等留在作品，不成为平台功能。只能针对已知苏博旧门户链接去重。原始快照与素材不改。无脚本时初始栏保持显示；整篇打印需单独打开内容页（iframe打印可能只包含当前区域）。

### 首页、我的与可选公开主页（v1.8.0）

- 首页 `/` 左侧完整分类树，主区搜索及最近更新；移动端选中分类展开子分类。
- `/space/` 概览各显示4作品 / 6素材，作品与素材分别有独立全量页面。`/login/?next=...` 是独立手机号/备用邮箱登录，返回路径仅允许站内已知页面。
- 设置 `/space/settings/`：绑定号码、备用邮箱、显示名称及公开主页。0003新增 `accounts.profile_public`，默认0；开启后 `/api/v1/profiles/{id}` 提供公开作品列表，关闭后API404，主页页面提示未公开；私有素材和联系方式不返回。
- 密钥 `/space/settings/keys/`：创建默认6个日历月（月底夹到目标月最后一天），可选1个月/1年或自定1–3650天；`POST account/keys/{id}/expiry` 可延长原密钥，需15分钟内验证过的浏览器会话。撤销的密钥不可恢复。
- 苏博已归属真实用户的D1记录。仅后台标记的 `legacy_id` / `legacy_initial_version` 可保留原 `/p/suzhou-museum/` 别名，客户端不能设置或改变这些标记。目录去除旧静态重复条目，原101公开素材索引保留；自己的素材库包含上传后的原资源副本，排除网页执行文件。
- 原苏博初始版本在主站同源读取原 `_content` 页面，保留既有阅读记录及控件；后续更新使用普通沙箱，原稳定地址仍保留。此例外只匹配管理员写入的精确旧版本。原静态副本及已经公开的原素材保留，不应把归档描述为销毁全部旧公开副本。新作品无同源例外。
- 两条苏博内容路由：`texopub.com/p/suzhou-museum/*` 到内容 Worker，`.../_content/*` 为更具体的无脚本路由，继续走 Pages；`/api/*` 路由保持不变。

## 生命周期实现与迁移

`migrations/0006_lifecycle.sql`为旧库增列和工作锁表，新库schema同步；不改已有作品，listing默认public。works保留deleted_at/delete_complete/deletion_version/delete_bytes，完成后只保留地址/归属与删除回执，不保留正文或版本。每次删除最多200个object_key，先关闭访问再删R2，R2成功后才删files引用，所有文件清完才删versions并释放total_bytes额度。失败保留待清理状态并可重试。work_operations串行化同作品上传和清理，异常finally解锁，崩溃锁15分钟到期；调用重试时不能绕过有效锁。新对象按publisher/work/hash分区；旧跨作品共享对象仅在没有其他未删除内容引用时删除。

listing独立存works，revision随提交或展示变更递增；versions.base_revision阻止旧草稿覆盖后来修改的展示范围。public进入catalog/materials，profile/public进入已开启profile，unlisted均不收录；链接及依赖始终可访问。独立素材private权限保持原样。get_my_space返回default_listing，普通发布密钥与OAuth可修改本人默认值。

旧苏博原始同源阅读路径由内容Worker先检查作品生命周期，再代理原Pages正文，以保留存储和交互；该路由不得继续绕过Worker。以前已经独立公开的素材/第三方副本不作为删除某份作品的独占文件。

上传清理锁优化：上传先用一次JOIN读取所属文件/版本，再在同一INSERT-SELECT里原子验证未删除草稿并取得锁，避免增加每个文件的重复读取。每文件4个D1语句，完整8文件新建及复用图标更新已在免费层MCP公网通过；单文件分步上传路径保留。
