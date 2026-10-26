## 个人空间、密钥与素材权限（v1.8.0）

个人空间 https://texopub.com/space/：手机号验证码首次注册/以后登录，备用邮箱须在登录后验证绑定，不能用任意邮箱另建空间或认领别人内容。验证码只在浏览器填写。进入「AI连接」并展开「管理本地 Agent 密钥」创建并下载凭证，放在作品目录之外，使用 `--credential`。AI密钥只展示一次，默认六个日历月有效期，可保持默认期限或自定义1–3650天；只读密钥不能写入或管理账号。

`my-works` 和 `my-materials` 需要密钥，只返回所属发布者内容；`materials` 是原有公开素材索引，不能用它代替我的素材库。所有者维护用的管理凭证不交给普通用户。

`assets` 新上传默认 `visibility=private`，文件在所属账号的浏览器会话或通过 Bearer 密钥访问，返回地址不是匿名分享链接。公开网页不能引用这种需要鉴权的地址；先获得用户明确公开授权，再 `assets ... --public`，或将授权资源作为公开网页依赖一起发布。不要把公开网页的图片说成仍然保密。

私有素材稳定访问路径 `/api/v1/me/assets/{work_id}`，更新仍保持同一入口；版本文件 `/api/v1/me/files/{version}/{path}` 仅所属账号可访问。匿名、其他账号、公共内容域和公开素材索引均不能读取私有素材。已有公开案例与旧素材保持原访问范围。公开与私有变更必须明确授权，保留 receipt 并使用 `--update`。

```sh
python3 scripts/commonplace.py --credential /private/path/credential.json my-works
python3 scripts/commonplace.py --credential /private/path/credential.json my-materials
python3 scripts/commonplace.py --credential /private/path/credential.json assets /path/to/image.png --slug image --title '私人素材'
# 仅在明确授权公开此文件后：
python3 scripts/commonplace.py --credential /private/path/credential.json assets /path/to/image.png --slug public-image --title '公开素材' --public
```

密钥到期前或过期后，可在密钥管理页调整同一把密钥的有效期，无需重新配置 AI；已撤销的密钥不能恢复，需要重新创建；重新登录不会改变publisher_id。未经用户明确要求，不创建、撤销或发给其他人密钥。当前认证服务是否已开通可读取 `/api/v1/auth/status`；状态未就绪不能宣称短信/邮件已可用。浏览器自助密钥管理仅接受本站安全会话和CSRF标记，AI密钥不能调用这些账号接口。

# 发布、素材与更新

本文件适用于已取得自助 AI 密钥或兼容的旧邀请凭证、且用户已明确要求公开发布的情况。凭证不是Cloudflare凭证，不能放进发布包、网页、网址或输出日志。

## 展示范围与永久删除（v2.0.0）

每次发布前，用一句话询问：「展示在哪里？不展示 / 仅个人主页 / 公开展示（默认）。」先用 `me` / `get_my_space` 读取 `default_listing` 作为默认建议；用户已经在本次请求中选择、或给过适用的长期指示时，直接执行，不重复询问。用户只说“默认”时使用其空间默认值。没有回答且没有既有选择或授权规则时，不把默认选项当成已确认；兼容客户端省略参数仍使用服务默认值。

- `unlisted` **不展示**：只出现在自己的管理页，不进入任何公开列表。
- `profile` **仅个人主页**：出现在已开启的个人主页，不进入 TexoPub 发现列表及公开素材索引。
- `public` **公开展示**：个人主页和 TexoPub 发现列表都展示；初始默认值。

三档控制收录位置，链接及网页依赖均可直接访问；“不展示”不是加密、私密访问或登录保护。个人主页未开启时不自动开启。独立素材的 `private/public` 权限保持原规则，不要和网页 `listing` 混淆。

发布/收录传 `--listing unlisted|profile|public`（插件 `publish_website` / `prepare_upload` 同名字段）。更新省略 listing 保持该作品原范围，不因默认值改变而扩大展示。可以不上传新版本，使用插件 `set_work_listing`，或客户端 `listing WORK_ID --expected-version VERSION --expected-revision REVISION --listing profile`；操作前读取 `show` / `get_work` 的当前版本和revision，冲突时刷新。

用户要求更改以后的默认值时，客户端 `preferences --default-listing profile` 或插件 `set_publish_preferences`。默认值保存到所属空间，由AI按要求修改；不改已有作品。改变默认值不等于用户要求省略每次发布询问，只有明确长期指示才省略。

永久删除仅在用户明确要求时执行，不用归档代替删除。先读取当前版本，再用插件 `delete_work(work_id, expected_version, confirm=true)`，或客户端 `delete WORK_ID --expected-version VERSION --confirm`。未提交草稿的版本为 null，CLI 用 `--expected-version draft`。删除不可恢复；关闭作品和历史链接，清除所有历史版本及不被其他内容引用的文件，完成后释放额度。返回 `deleted=false,deleting=true` 表示仍在清理，继续使用相同参数，直到 `deleted=true`；失败也用原参数重试，不宣称已经完成。地址占用记录保留，旧短网址不会指向别人的内容。外部收录只删本站记录和图标，不影响原站。

让AI处理「我的作品」中的已发布、草稿或归档作品，以及「我的素材」中的独立素材。网页只负责展示，不提供手动内容编辑。网页依赖属于整份作品，不能在素材卡中误删整份作品。`archive` 仍只下架保留数据和额度。测试内容验收后永久删除并核实目录、本人列表、旧链接和额度，只保留少量本地证据。


## 收录已有网站

用户已有公开网站，仅希望加入导航时使用 `submit`。无需Cloudflare账户、服务器或DNS修改；只上传一份专属图标（SVG/PNG/ICO，最多1MiB），网站内容仍由原站托管。目录中的链接直接前往原站，不加平台外壳。凭证表示有权管理本站收录记录，不代表平台验证了域名所有权；不要把收录者冒充原站作者。

```sh
python3 scripts/commonplace.py --credential /private/path/credential.json categories
python3 scripts/commonplace.py --credential /private/path/credential.json submit https://your-site.example/guide/ --slug existing-guide --title '已有网站' --summary '主要用途' --category humanities/museums --icon /path/to/site-icon.svg --format guide --tags '导览,AI共创'
```

先确认用户指定的原站公开范围，再读取原站核对用途与链接；若当前工具无法访问，如实说明。API仅验证网址结构，不抓取外站或声称检查其在线状态。仅接受公开HTTPS域名，不能含用户名密码、本机/裸IP地址或自定义端口；不要提交含私有访问令牌的链接。路径、查询参数和片段保留；同一地址去除片段后不能重复收录。不同路径可以是不同作品。

每条收录也须使用有效二级分类和专属图标；可沿用经用户授权的原站图标，缺少时由AI制作。`--license`只描述用户明确授权的许可，默认未声明，不改变原站许可。成功后检查目录`source=external`、原站`url`、域名、分类和图标。收录图标只用于目录展示，不进入独立素材目录。

更新时在同一receipt目录、相同身份与slug运行完整`submit`命令并加`--update`；可修改原站URL、简介、分类和图标，记录ID不变。`--link-status unavailable`用于标记链接可能失效；恢复默认`--link-status unchecked`仅清除该标记，不表示已通过平台自动检测。暂未提供定时巡检。

```sh
python3 scripts/commonplace.py --credential /private/path/credential.json show WORK_ID
python3 scripts/commonplace.py --credential /private/path/credential.json withdraw WORK_ID --expected-version CURRENT_VERSION
```

`show`使用本人凭证读取当前版本；`withdraw`仅允许所属发布者移除自己的外部收录，带上最新版本避免覆盖并发更新。移除后不再显示，原站不受影响；归档记录和历史图标保留占用额度；永久清理请用delete，不提供自动恢复。管理员也可下架。同一条记录不能在托管与外部收录之间切换；不把`submit`用于给本站托管作品绑定域名。

## 准备作品

支持单个HTML、包含index.html的专用文件夹、ZIP。单HTML只收集可识别的本地依赖；包含动态脚本的作品优先使用完整文件夹。不要把整个Documents目录当作输入。

- 本地链接使用相对路径。根路径引用、硬编码站点路径和JS动态拼接依赖，需要发布前适配。
- 常见base64内嵌图片由客户端提取为独立文件；其他动态依赖不能保证自动识别。
- 网页是静态HTML/CSS/JavaScript，不运行上传者的后端程序。
- AI按主要内容选择一个有效二级分类ID，如`humanities/museums`。形式为`guide`、`article`、`report`、`tutorial`、`tool`、`visualization`、`portfolio`之一；标签补充跨主题关联。
- 每份新网页都需要专属图标：SVG/PNG/ICO，SVG需自包含。可以直接绘制简洁矢量图，不能拿站点通用图标代替。

## 本站托管 URL 规范：发布前遵循

- 新上传网页由服务生成稳定入口：`https://content.texopub.com/p/{public_slug}/`。AI选择`--slug`，服务自动处理全站重名并分配短地址；不要自行创建作者目录、猜测或承诺`https://texopub.com/p/{slug}/`已被映射。最终使用提交结果或实时目录中的完整`url`。
- `slug`使用小写英文字母、数字、单连字符，最多64字符，例如`museum-guide`。不包含斜杠，不嵌入分类层级、版本号或凭证。不同发布者可使用相同slug；同一发布者沿用已有receipt和slug更新，不另建副本绕过冲突。
- 分类通过`--category`写入元数据，标签补充交叉主题。改变分类或标题不改变作品路径；更新时保持身份、`slug`和`work_id`，用`--update`及期望版本处理并发。
- `/p/`表示整份作品，不要求每份作品只有一个HTML。多页网页打成同一专用文件夹/ZIP，保留目录结构；例如入口`index.html`、子页`route.html`、`chapters/intro.html`和`assets/cover.jpg`。HTML/CSS/JS中的包内引用使用`./route.html`、`./assets/cover.jpg`等相对路径，嵌套页面按其位置调整。不要把每个子页分别上传成独立作品，也不要在包内硬编码某位作者或最终作品域名。
- 服务写入版本素材基址，因此实际点击包内相对链接可能进入当前`/v/{version_id}/...`；这是同一发布版本的资源解析。对外优先给稳定`/p/.../`入口；需要分享子页时，在服务返回的作品URL下定位子页并实际核验，例如`.../p/{public_slug}/chapters/intro.html`。不要把版本资源链接当作随更新自动变化的作品入口。
- 原苏博的`https://texopub.com/p/suzhou-museum/`及既有链接继续有效，是旧案例兼容路径；不为统一外观擅自迁移、重命名或创建重复作品。原始上传来源的独立origin与沙箱保持现状。

## 本站托管平台标题栏与作品的边界

平台统一提供独立标题栏：左侧是房屋轮廓内的T标志（无“返回TexoPub”文字），点击前往 `https://texopub.com/`；中间显示当前作品HTML的 `<title>`，切换子页或标题变化后同步。向下阅读时平台栏自动收起、释放高度，向上滑动恢复；收起后顶部细小展开柄也可以手动恢复。禁用动画偏好下不播放收起动画；没有脚本时保留主页图标与初始标题，自动收起与标题同步不可用。

**平台与作品是两个页面区域。** 作品在下方iframe中运行，其固定导航、样式和DOM不参与平台栏布局。大字、目录、搜索、播放、作品内部返回上一页等属于作品，由作品自己实现；不得把某份示例HTML的控件当成平台公共功能，也不要求上传者为平台栏修改自己的top/布局。AI无需制作同款平台栏、浮动返回按钮或预留平台栏高度。

对外仍交付服务返回的稳定 `/p/{public_slug}/` 地址；HTML子页和直接打开的版本HTML也使用同一平台外壳。`/_texopub/content/v/...` 是外壳内部内容路径，仅用来加载作品及解析相对资源，不作为作品主页交付。切换包内HTML子页时标题与可分享的稳定地址同步。不得把平台内部路径硬编码进上传HTML。

内容Worker在读取时提供外壳，并为作品响应加入很小的标题/滚动通信脚本，保留原始R2文件、receipt、作品URL与素材。非HTML素材没有外壳。公开上传作品继续在不含allow-same-origin的sandbox中执行，不能访问平台DOM；消息仅用于标题、阅读状态和同作品路径，平台核对发送窗口并使用纯文本标题。原所有者静态案例保持既有交互及存储能力，但同样分开两层界面。

发布后分别核验：平台主页图标、HTML标题同步、下滑收起/上滑恢复、至少一个HTML子页（若有）；再核验作品原来的目录、搜索、大字等控件。已有作者导航通常保留；仅苏博已知旧门户链接作为旧案例的重复平台入口被移除，不扫描/删除其他作品控件。

## 发布网页

在技能根目录运行；相对脚本路径如需调整，以实际安装位置为准。

```sh
python3 scripts/commonplace.py --credential /private/path/credential.json publish /path/to/report.html --slug report-name --title '作品标题' --summary '主要用途' --category technology/software --icon /path/to/report-icon.svg --format tool --tags '标签一,标签二'
```

完整文件夹或ZIP使用相同命令替换source。可用`--cover 包内图片相对路径`指定封面；用户明确许可时用`--license '许可说明'`，默认“未声明开放许可”。

服务器校验SHA256、分类、文件与图标，将素材基址和favicon写入HTML。所有文件就绪后才发布，并按listing进入相应导航；草稿不会提前出现。网页和素材均在云端保存，不需要站点所有者的电脑运行发布器。

发布返回`url`、`work_id`、`version`，并在当前目录保存`.commonplace-<slug>.json` receipt。保留它，失败时在相同目录重试相同命令可复用未完成上传会话，避免重复上传；不要通过换slug绕过错误。

## 独立素材

```sh
python3 scripts/commonplace.py --credential /private/path/credential.json assets /path/to/photo.jpg --slug photo-one --title '照片说明'
```

每次传一个文件。图片、常见音视频、PDF及常用文档可单独发布，默认私有，成功后进入所属空间；只有 --public 时进入公开素材目录并返回匿名可引用链接，不作为一份网页作品。公开网页只能引用已授权公开的资源；保留用户原件，不有损重编码绕过限制。

## 更新作品

在保存receipt的同一目录、相同slug运行发布命令并加`--update`，保留作品网址；或显式指定`--work-id`和`--expected-version`。只有所属发布者可以更新。版本冲突时先读取最新状态，不强制覆盖。

```sh
python3 scripts/commonplace.py --credential /private/path/credential.json me
python3 scripts/commonplace.py list
```

`me`查看自己的身份、额度和作品；`list`查看公开作品（含外部收录）；`show WORK_ID`读取公开作品当前版本；`materials`读取素材目录。`assets`也支持携带receipt加`--update`，或显式指定作品ID和期望版本。接口说明：https://texopub.com/for-ai/openapi.json 。

## 发布后的查看与交付

实际打开返回URL或HTTP获取验证内容与图标，检查实时作品索引包含该作品及正确分类；独立素材按可见性检查所属素材库/公开目录，私有下载必须带当前身份。给用户可点击的网页与素材地址，说明已完成、失败或受限的具体状态，不把创建会话当作发布成功。

## 当前限制

- 单文件25MiB、单次100MiB、最多250文件、HTML正文2MiB、图标1MiB。
- 默认每名发布者512MiB预留存储，包含草稿和历史版本；每日20次新会话。
- 本站托管的新网页在独立来源的沙箱内运行，普通脚本可执行；localStorage/cookie、Service Worker、需要同源身份的应用和部分弹窗/导航能力可能不可用。外部收录仍按原站自身环境运行。
- 草稿24小时后不可再提交，但空间不会自动释放；超限或需清理时联系所有者。
- 暂取最多1000份云端作品与2000个当前版本素材文件，外加原案例；未提供无限容量保证。
- 大视频分片、MCP尚未提供；手机号注册须以服务实际开通状态为准。原苏博保留原网址与交互，作为只读基线；更新该案例由所有者处理迁移，不能另建同名副本。

## 网站入口（v1.8.0）

- `/` 是公开首页：左侧按主题筛选，搜索下方为最近更新，按更新时间倒序。
- `/space/` 是「我的」概览，只显示自己的最近4份作品与6份素材；`/space/works/`、`/space/materials/` 分别查看全部。私有素材永不进入别人的空间或公开主页。
- `/space/settings/` 管理手机号、备用邮箱、显示名称及公开主页开关。默认不公开主页，不要代用户开启。关闭主页不等于将已经发布的作品设为私有。
- `/space/settings/keys/` 创建、撤销或调整密钥期限；默认六个日历月，自定义1–3650天。延长期限继续使用原密钥，完整密钥仍仅创建时显示一次；更改期限需要近期登录。
- `/publish/` 提供静态发布步骤及插件/Skill接入说明，没有复制或手动上传按钮。「AI连接」中由本人创建密钥；未登录先进入独立 `/login/`。
- 苏博是从原静态基线迁入的作品，仍以服务返回的 `https://texopub.com/p/suzhou-museum/` 为稳定入口；不要为迁入作品拼接新地址。普通新作品自动使用服务返回的自有域名短地址。

## 自动分配带域名的短地址（v1.9.0）

发布静态网页即由TexoPub提供托管、HTTPS和自有内容域名。普通 `publish` 无须添加参数、联系平台、配置DNS或维护别名。服务优先以 `--slug` 自动分配 `https://content.texopub.com/p/{public_slug}/`；不同发布者同名时自动加短后缀，例如 `museum-guide-a1b2c3`。因此请求的slug与最终public_slug可能不同，始终交付发布提交结果、`show`或实时目录返回的完整 `url`，不能猜测或自行拼接。

短地址在作品创建时保留，更新沿用原work_id、receipt与 `--update`，地址不变。下架后仍保留名称，旧链接不会转向别人的作品。草稿、下架内容及私有素材不能通过短地址访问；外站收录仍使用原站网址。旧含发布者ID的作品路径和workers.dev链接继续有效；苏博保留其已公布的兼容入口。短地址可包含多HTML子页，沿用同一作品根路径。

内容域与主站不同origin，并保持iframe沙箱；普通发布者只需自己的TexoPub发布密钥，不需要Cloudflare账号或域名管理权限。川大导览的短地址也使用同一通用分配机制，不再单独配置。

## 共创社区与资料更新（v2.1.0）

网站以搜索、作品封面和创作者主页为中心。内容和资料在 AI 中修改，网页只提供当前页的简短说明；登录、公开主页授权、密钥与联系方式验证仍由本人完成，不向用户索取验证码或登录 Cookie。

- 先用 `profile` / `get_my_profile` 读取资料和 revision。用 `profile-update --expected-revision N` 或 `update_my_profile` 修改名字、头像和已获确认的简介；只传要改的字段，冲突后重新读取，不直接覆盖。name=null（CLI `--reset-name`）恢复固定默认名，avatar_url="" 恢复默认头像，bio="" 明确清空简介。主页开关不在 AI 接口中。
- 默认中文名由项目原创词表生成并保存，词表升级不重命名已有用户；头像按身份ID生成。自定义头像需公开HTTPS图片，不能用鉴权私有素材链接。简介默认空，只有用户提供或确认后才写入。
- 用 `partners` 查看伙伴，或 `partner --key codex --application Codex --expected-revision 0` / `upsert_ai_partner` 新建。key在所属空间固定；新建revision=0，更新用实际revision。名称默认可确认的应用名，不猜具体模型；伙伴昵称、简介和自定义头像的改动遵循用户要求。`show_on_profile` 仅在用户明确要求展示该伙伴时设置，不会开启主页。
- 发布时通过 `--ai-partners /path/to/contributors.json` / `ai_partners` 自报本件真实参与信息。例如 `[{"key":"codex","application":"Codex","contribution":"编写网页与交互"}]`。可以填写可确认的 `model`；未知则省略，不写“模型未提供”。单纯上传只记录上传，不冒称创作。信息是自报，不代表模型认证；旧作品不自动补署名。更新省略数组沿用原记录，空数组明确清空。
- 没有封面时平台使用标题、分类、图标与配色排版兜底，不必生图。已有封面可用包内 `--cover` / `cover` 图片路径；原文件按字节保存。
- 现有网站使用 CLI `submit` 或插件 `submit_website` 收录，保留原站地址及托管；不复制原站。独立素材改权限时，先 `show` / `get_work`，再用 `asset-visibility WORK_ID --expected-version VERSION --expected-revision N --visibility private|public` / `set_asset_visibility`。只有用户明确同意公开时设public；不能用于网页依赖文件。
