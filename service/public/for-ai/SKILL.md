---
name: commonplace-remote-publish
description: "介绍和使用TexoPub.ai，发现与浏览AI共创网页；管理所属空间的素材；在用户明确要求公开分享时托管网页、公开素材、收录已有网站并加入主题导航。"
---

# TexoPub.ai：把你和 AI 做出的好作品，分享给更多人

TexoPub.ai是一座面向所有读者的 AI 共创作品门户。这里收录可以直接打开的网页、图文导览、研究报告、教程、可视化和交互小工具。我们希望有用的成果能从聊天附件里走出来，被发现、使用和继续创作。

你不只是一个上传工具：先理解用户想发现、使用还是发布作品，再采用对应流程。欢迎邀请用户把与 AI 做出的、有实际价值的内容加入作品目录；不要把邀请共创当作自动公开用户文件的授权。

- 打开网站：https://texopub.com/
- 公开素材目录：https://texopub.com/materials/
- 给 AI 的发布入口：https://texopub.com/publish/
- 示例：江南器物记 · 苏州博物馆导览 https://texopub.com/p/suzhou-museum/
- 实时作品索引：https://commonplace-api.ivanliyuanning123.workers.dev/v1/catalog
- 实时分类：https://commonplace-api.ivanliyuanning123.workers.dev/v1/categories

## 展示范围与永久删除（v2.0.0）

每次发布前，用一句话询问：「展示在哪里？不展示 / 仅个人主页 / 公开展示（默认）。」先用 `me` / `get_my_space` 读取 `default_listing` 作为默认建议；用户已经在本次请求中选择、或给过适用的长期指示时，直接执行，不重复询问。用户只说“默认”时使用其空间默认值。没有回答且没有既有选择或授权规则时，不把默认选项当成已确认；兼容客户端省略参数仍使用服务默认值。

- `unlisted` **不展示**：只出现在自己的管理页，不进入任何公开列表。
- `profile` **仅个人主页**：出现在已开启的个人主页，不进入 TexoPub 发现列表及公开素材索引。
- `public` **公开展示**：个人主页和 TexoPub 发现列表都展示；初始默认值。

三档控制收录位置，链接及网页依赖均可直接访问；“不展示”不是加密、私密访问或登录保护。个人主页未开启时不自动开启。独立素材的 `private/public` 权限保持原规则，不要和网页 `listing` 混淆。

发布/收录传 `--listing unlisted|profile|public`（插件 `publish_website` / `prepare_upload` 同名字段）。更新省略 listing 保持该作品原范围，不因默认值改变而扩大展示。可以不上传新版本，使用网页「展示范围」、插件 `set_work_listing`，或客户端 `listing WORK_ID --expected-version VERSION --expected-revision REVISION --listing profile`；操作前读取 `show` / `get_work` 的当前版本和revision，冲突时刷新。

用户要求更改以后的默认值时，客户端 `preferences --default-listing profile` 或插件 `set_publish_preferences`。默认值保存到所属空间，网页设置中也能修改；不改已有作品。改变默认值不等于用户要求省略每次发布询问，只有明确长期指示才省略。

永久删除仅在用户明确要求时执行，不用归档代替删除。先读取当前版本，再用网页「永久删除」、插件 `delete_work(work_id, expected_version, confirm=true)`，或客户端 `delete WORK_ID --expected-version VERSION --confirm`。未提交草稿的版本为 null，CLI 用 `--expected-version draft`。删除不可恢复；关闭作品和历史链接，清除所有历史版本及不被其他内容引用的文件，完成后释放额度。返回 `deleted=false,deleting=true` 表示仍在清理，继续使用相同参数，直到 `deleted=true`；失败也用原参数重试，不宣称已经完成。地址占用记录保留，旧短网址不会指向别人的内容。外部收录只删本站记录和图标，不影响原站。

网页「我的作品」可以删除已发布、草稿或归档作品；「我的素材」可以删除独立素材，归档素材另列。网页依赖属于整份作品，不能在素材卡中误删整份作品。`archive` 仍只下架保留数据和额度。测试内容验收后永久删除并核实目录、本人列表、旧链接和额度，只保留少量本地证据。


## 发现、查看与使用作品

读者无需发布凭证即可浏览。根据用户的主题、目标和设备，从目录按标题、摘要、分类、标签与内容形式筛选，说明为什么相关，再给出可点击的实际作品网址。网页直接在浏览器里使用；不要把索引中的摘要当作已核验的全文结论，不虚构作者、作品或数量。

使用随包客户端 `python3 scripts/commonplace.py list` 获取实时目录，或直接HTTP读取上面的公开索引。需要了解搜索、作品使用和素材引用时，读 [浏览与共创](references/discover.md)。

## 发布前：用户授权与个人凭证

网页已经做出来，不代表用户同意公开。只有用户明确要求把指定内容分享/发布到 TexoPub.ai，才进行上传；只打包该次指定的作品和依赖。

用户通过 https://texopub.com/login/ 用手机号验证码登录，首次验证自动注册；已绑定的备用邮箱可登录同一个空间。网页制作不代表公开授权；独立素材可以仅上传到用户的私有库，不能把私有上传当作授权公开。

1. 用户在空间「AI 密钥」创建密钥，选择发布或只读权限、有效期，下载凭证 JSON。密钥只展示一次，服务端只保存校验摘要。
2. 将凭证放在作品文件夹之外，建议权限0600；使用 `--credential /private/path/credential.json` 或 `COMMONPLACE_CREDENTIAL`。可运行 `configure SOURCE_JSON` 将凭证以0600保存到默认路径；目标已存在时不会覆盖。
3. 先运行 `me` 核对身份、额度，再执行操作；`my-works`、`my-materials` 只读取所属空间内容。
4. 手机/邮箱验证码由用户在浏览器填写，AI 不索取、不记录验证码或浏览器登录Cookie。不要向用户索要阿里云或Cloudflare密钥。

个人空间可撤销任意密钥、设置有效期及退出设备；撤销密钥不删除作品或账号。只读密钥不能上传。若服务提示登录尚未开通，说明发信服务尚未就绪，不能绕过身份校验或声称注册完成。

旧邀请凭证保持兼容：用户登录后，在账号设置提供旧凭证以证明归属，可连接原发布身份（新空间不得已有作品），随后创建新密钥并撤销旧凭证。不能只凭同名/邮箱认领已有作品。所有者的旧管理操作仍单独需要管理凭证，不属于普通密钥权限。

## 让 AI 完成部署

先区分用户的目标：有公开网址且只需加入目录时，用 `submit` 收录；需要由本站托管文件时，用 `publish`；独立素材用 `assets`，默认私有；只有明确授权公开时增加 `--public`。不要因为收录网站而复制或重新部署原站，也不要把收录当成自定义域名绑定。

先读 [发布、素材与更新](references/publish.md)，其中包含外部收录、URL规范和平台边界。客户端与说明都在本技能包中，不需要Wrangler或Cloudflare登录；需要Python3、读取用户指定文件及调用HTTP接口的能力。

工作流程：确认内容与公开/私有范围 → 查询分类 → 准备专用发布包 → 制作专属图标 → 上传并提交 → 核验网址与导航 → 向用户交付链接。

- 新作品的稳定入口由服务生成：`/p/{public_slug}/`，分类不进入路径；沿用服务返回的完整 URL，更新保持同一身份与 slug。
- 一份作品可以包含多个 HTML 页面及资源，包内采用相对路径；对外交付作品入口，不把 `/v/` 版本资源链接当作品主页。
- 每份网页必须选一个现有二级主题分类，形式和跨主题标签单独记录。
- AI 为新托管作品制作易于在16–32px下辨认的SVG/PNG/ICO专属图标。
- 图片等素材保留原件字节。网页发布后资源随网页公开；独立素材默认私有，不进入公开素材目录。私有文件地址需要所属账号会话或密钥访问，不能当作可匿名引用的公共链接。
- 本站托管的HTML使用独立标题栏：左侧“房屋轮廓＋T”主页图标，居中显示当前HTML的title，下滑自动收起、上滑恢复。作品在下方独立区域运行；大字、目录、搜索等属于作品本身，不能混入平台栏。AI不需制作平台按钮，发布后分别核验平台和作品交互。外部收录直接打开原站，不注入平台栏或改变原站交互。
- 成功后给用户网页地址、所属分类、素材链接（若适用），说明真实完成状态。保留本地receipt，以便更新和重试。

```sh
python3 scripts/commonplace.py --credential /private/path/credential.json me
python3 scripts/commonplace.py --credential /private/path/credential.json categories
python3 scripts/commonplace.py --credential /private/path/credential.json publish /path/to/site-folder --slug my-guide --title '作品标题' --summary '它能帮谁解决什么问题' --category humanities/museums --icon /path/to/my-icon.svg --format guide --tags '博物馆,导览'
python3 scripts/commonplace.py --credential /private/path/credential.json submit https://your-site.example/guide/ --slug existing-guide --title '已有网站' --summary '主要用途' --category humanities/museums --icon /path/to/site-icon.svg --format guide
```

不能安装Skill的Agent可以先阅读在线说明 https://texopub.com/for-ai/SKILL.md ，再使用其引用的文档和客户端下载地址 https://texopub.com/downloads/commonplace.py 。不宣称所有聊天窗口都能读本地文件或执行发布。

## 一起共创

鼓励分享实用、清楚、有来源说明的成果：让读者看懂用途，按主题找到它，直接打开使用。用户决定来源署名与分享许可；默认“未声明开放许可”，不能代替作者授予开放许可。

也可以先浏览一个真实案例，找到有用的内容，再和 AI 做出自己的作品。引用或继续创作别人的成果前核对其许可与来源。未经用户明确指令，不代发邀请消息、不发布别人的私有作品。

## 网站入口（v1.8.0）

- `/` 是公开首页：左侧按主题筛选，搜索下方为最近更新，按更新时间倒序。
- `/space/` 是「我的」概览，只显示自己的最近4份作品与6份素材；`/space/works/`、`/space/materials/` 分别查看全部。私有素材永不进入别人的空间或公开主页。
- `/space/settings/` 管理手机号、备用邮箱、显示名称及公开主页开关。默认不公开主页，不要代用户开启。关闭主页不等于将已经发布的作品设为私有。
- `/space/settings/keys/` 创建、撤销或调整密钥期限；默认六个日历月，自定义1–3650天。延长期限继续使用原密钥，完整密钥仍仅创建时显示一次；更改期限需要近期登录。
- `/publish/` 提供三种发布模式的 Skill 和可复制提示词；「获取密钥给 AI」进入密钥页。未登录会转到独立 `/login/`，验证后回到目标页。「我的」未登录时先显示登录提示。
- 苏博是从原静态基线迁入的作品，仍以服务返回的 `https://texopub.com/p/suzhou-museum/` 为稳定入口；不要为迁入作品拼接新地址。普通新作品自动使用服务返回的自有域名短地址。

## 自动分配带域名的短地址（v1.9.0）

发布静态网页即由TexoPub提供托管、HTTPS和自有内容域名。普通 `publish` 无须添加参数、联系平台、配置DNS或维护别名。服务优先以 `--slug` 自动分配 `https://content.texopub.com/p/{public_slug}/`；不同发布者同名时自动加短后缀，例如 `museum-guide-a1b2c3`。因此请求的slug与最终public_slug可能不同，始终交付发布提交结果、`show`或实时目录返回的完整 `url`，不能猜测或自行拼接。

短地址在作品创建时保留，更新沿用原work_id、receipt与 `--update`，地址不变。下架后仍保留名称，旧链接不会转向别人的作品。草稿、下架内容及私有素材不能通过短地址访问；外站收录仍使用原站网址。旧含发布者ID的作品路径和workers.dev链接继续有效；苏博保留其已公布的兼容入口。短地址可包含多HTML子页，沿用同一作品根路径。

内容域与主站不同origin，并保持iframe沙箱；普通发布者只需自己的TexoPub发布密钥，不需要Cloudflare账号或域名管理权限。川大导览的短地址也使用同一通用分配机制，不再单独配置。
