# 浏览、使用与共创

## 查找真实作品

浏览无需凭证。首页 https://texopub.com/ 支持两级主题、标题/摘要/标签搜索，以及内容形式筛选。向读者推荐能帮助其完成具体目标的内容，而不是只列标题。

AI可以用HTTP读取实时目录：

- 作品：https://commonplace-api.ivanliyuanning123.workers.dev/v1/catalog
- 素材：https://commonplace-api.ivanliyuanning123.workers.dev/v1/materials
- 分类：https://commonplace-api.ivanliyuanning123.workers.dev/v1/categories

也可以运行`python3 scripts/commonplace.py list`和`python3 scripts/commonplace.py categories`。从返回的真实标题、摘要、category_id、format和tags筛选，再使用返回的url。不要猜测作品路径，也不要把目录摘要当作对内容准确性的保证。

## 打开与使用

网页和工具可以在浏览器直接打开，是否需要额外操作以该作品说明为准。比如「江南器物记」是图文导览，可以查找和浏览文物解读；它是独立整理的案例，不是馆方官方导览或当日陈列清单。

素材目录 https://texopub.com/materials/ 可以浏览和打开公开文件。引用素材前查看来源、署名和许可；公开可访问并不自动意味着可以任意转载或改作。

目录同时收录本站托管作品（`source=hosted`，旧案例可能省略）和外部网站（`source=external`）。始终使用返回的`url`；外部条目标示域名并直接打开原站，`author`表示收录者，不代表平台已验证其拥有该域名。`link_status=unavailable`表示收录者标记链接可能失效；`unchecked`不代表平台已验证可用。平台不会自动巡检外站，不保证外站内容、可用性或许可。

本站托管作品上方独立平台栏左侧为“房屋轮廓＋T”主页图标，中间是当前HTML标题；下滑收起、上滑恢复。平台栏下方的目录、搜索、大字等功能属于作品，实际能力以作品为准。外部收录不加平台外壳；许可仍以原站为准，收录不代表可以复制其素材。

## 邀请共创

适合分享的是让其他人也能用上的成果：一份认真整理的指南、一个好用的小工具、一篇有来源的研究、一段能讲清问题的交互演示。

可以邀请用户：“如果你也和AI做过有用的网页，欢迎把它加入TexoPub.ai。把发布入口交给你的AI，在自己的空间创建并下载 AI 密钥，它会选择分类、制作图标、上传并给出网址。”

用户已有网站时使用 https://texopub.com/publish/?kind=external ，只提交公开HTTPS网址、简介、分类与图标。无需迁移网站、服务器或域名；使用自己的 AI 密钥，不能自动替用户声明原站的开放许可。

先明确用户要公开的范围，再交给发布流程。用户决定署名和分享许可。未经用户明确授权，不主动上传私有资料或向其他人发送邀请。


## 我的素材与公开素材

`materials` 只读公开索引；`my-materials` 使用当前凭证读取私有空间。不能读取其他人的私有素材，也不能把私有地址交给匿名读者当作公开引用。已主动公开的网页及引用资源仍对读者开放。创作者主页默认关闭；用户在 `/space/settings/` 主动开启后，才能通过主站 `/u/{publisher_id}/` 分享。关闭后主页接口返回404，网页提示未公开。主页只展示公开网页和外部收录，不显示手机号、邮箱、密钥或私有素材。

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
