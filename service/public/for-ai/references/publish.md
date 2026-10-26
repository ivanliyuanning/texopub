# 发布与更新操作说明

本页适用于已连接本人TexoPub插件或已取得本人发布密钥的AI。共用授权/展示规则见 [SKILL.md](../SKILL.md)；网页入口和公开浏览见 [discover.md](discover.md)。按用户任务阅读对应段落，不把平台维护权限当作普通发布能力。

## 1. 先读身份与目标

插件用 `get_my_space`，本地客户端用：

```sh
python3 scripts/commonplace.py --credential /private/path/credential.json me
python3 scripts/commonplace.py --credential /private/path/credential.json my-works
python3 scripts/commonplace.py --credential /private/path/credential.json show WORK_ID
```

`show` / `get_work`只读本人作品，包括草稿和归档，不是任意公开作品读取工具。公开内容用catalog/profiles HTTP索引和作品URL；本人素材用my-materials，不用materials代替。

先确定托管网页、外站收录或独立素材，并确认用户授权内容及展示/访问范围。先读取再修改：作品用version，listing和独立素材权限同时用revision，个人资料用profile的revision，伙伴用该伙伴自己的revision。冲突后重新读取再核对，不重复新建。

## 2. 准备完整静态包

CLI支持单HTML、含index.html的专用文件夹、ZIP；云端MCP只接收已展开的静态成品/文本/授权附件，不能读取本机路径、解ZIP或编译工程。框架项目先本地构建导出；动态依赖较多时用完整文件夹，不依赖单HTML的静态扫描自动收齐。

- 包内用相对路径，支持多个HTML页面及CSS/JS/图片。适配根路径引用、硬编码网址和JS动态拼接依赖，不把子页拆成独立作品。
- CLI可提取常见base64内嵌图片，保留图片原字节；不有损压缩用户原件绕过限额。
- 先读取categories / list_categories，选择现有二级完整ID，例如humanities/museums，不能只写museums。format为guide/article/report/tutorial/tool/visualization/portfolio之一，tags补充跨主题关联。
- 新作品必需专属SVG/PNG/ICO图标，SVG自包含，16–32px可辨。不能用站点通用图标或封面代替。
- 无封面自动排版兜底；已有封面用包内图片相对路径cover，不是远程URL。封面文件也要进入完整上传清单。

## 3. CLI发布、更新与收录

以下公开展示例子仅在用户已经选public时使用；其他情况替换为用户确认的listing。密钥全局参数位于子命令前。

```sh
python3 scripts/commonplace.py --credential /private/path/credential.json categories
python3 scripts/commonplace.py --credential /private/path/credential.json publish /path/to/site-folder --slug my-guide --title '作品标题' --summary '它的具体用途' --category humanities/museums --icon /path/to/icon.svg --format guide --tags '导览,共创' --listing public --cover assets/cover.jpg --ai-partners /path/to/contributors.json
python3 scripts/commonplace.py --credential /private/path/credential.json submit https://your-site.example/guide/ --slug existing-guide --title '已有网站' --summary '主要用途' --category humanities/museums --icon /path/to/icon.svg --format guide --listing public
```

没有封面或参与记录文件时省略对应参数。CLI目前publish和submit在更新时也要求传`--icon`，不能照抄MCP网页更新的省略图标方式。用原图标文件即可，不要求重新设计。

发布返回url/work_id/version并保存`.commonplace-<slug>.json` receipt。失败时同一目录、同一内容和参数重试复用会话；新版加`--update`，或同时指定`--work-id`与`--expected-version`，沿用原slug/身份。保留receipt，不能靠换slug或另建作品绕过冲突。

外站收录保留原URL及托管，只上传图标和目录资料。仅接受公开HTTPS域名，不接受账号密码、本机/裸IP、自定义端口或私有令牌URL；去掉片段后相同URL不能重复收录。同一条记录不能在托管与收录间转换。author是收录者，不代表认证原作者或域名归属。

收录更新运行完整submit命令并加--update。CLI可改URL、标题、摘要、分类、图标、tags、license和link_status；`--link-status unavailable`标记可能失效，unchecked仅清标记，不是在线认证。MCP submit_website支持其schema列出的字段，不能把CLI的tags/license参数当成该工具也有。没有外站自动巡检或域名绑定服务。`withdraw ID --expected-version VERSION`仅下架本人外站记录，原站不受影响，历史仍占额度；彻底清理用delete。

## 4. MCP一键与分步发布

`publish_website`：传slug/title/category_id/idempotency_key、HTML或text_files/附件及图标；更新同时传原work_id和当前expected_version。`html`默认入口index.html，附件与attachment_paths按顺序对应。传的是授权文件对象，不是本地路径或sandbox字符串。

一键最多8份文件、每份25MiB、合计32MiB。HTML、CSS、JS、封面和图标都占文件名额，自动复用的图标也算。直接文本组成的整个MCP JSON请求还受3MiB请求体限制；超过一键能力就分步，不截断内容。

- 新托管网页提供icon_svg或图标附件。
- `publish_website`更新省略icon_svg和icon可复用该作品旧图标，其他文件仍须完整提供。
- `submit_website`无论新建或更新都要求icon_svg，沿用原SVG即可；不能套用上述省略规则。
- `prepare_upload`要求完整files清单、entry和icon包内路径，没有自动补旧文件/旧图标的保证。

分步：`inspect_files`每次最多8份，返回真实bytes和sha256 → 合并完整files清单 → `prepare_upload`取得upload_id → 按返回的上传路径用`upload_file`逐份上传未ready文件 → `commit_upload`提交。支持250文件/100MiB，不是“先发8份再补上其余”。prepare只是私有草稿，所有文件就绪并提交后才按listing收录。

同一次请求重试使用同一idempotency_key或upload_id，新版才用新键；失败保留会话/回执，不把准备或部分上传当成功。所有文件就绪后可重试同一commit，不会新建版本。

## 5. 更新是完整版本，不是补丁

先get_work/show读取实际版本、范围、分类、format、摘要、tags、封面与参与记录。提交完整新版文件和要保留的元数据；只上传“改动的一个文件”会使未包含的依赖或子页不再属于新版。

省略listing沿用旧范围，省略ai_partners沿用旧参与记录，空数组清空。除此之外，不要假定省略字段会自动保留：摘要/tags/format等可能回到默认值，未再指定cover会回到默认封面。保留原封面时，把图片放进新版包并再次指定cover。需要工具不支持的元数据字段时选实际支持它的CLI/REST，不能发未知参数并声称保留。

目前没有普通用户的作品metadata-only修改工具。用户只改标题、摘要、封面或旧署名时，可用完整源文件更新同一作品；缺源文件就保留现状并说明缺少的完整包，不能拼凑空HTML或删掉依赖。平台所有者做过的定向数据库维护不代表插件/CLI已提供此能力。

## 6. 人类资料与AI伙伴

先get_my_profile或CLI profile/partners，复用对应客户端已有的伙伴key。新伙伴expected_revision=0；更新使用该伙伴revision，不能使用人类资料的revision。key在空间内固定，不因每次上传换一个。

个人资料：`update_my_profile(expected_revision, name?, bio?, avatar_url?)`；name=null恢复默认名，bio=""清空，avatar_url=""恢复几何头像。CLI示例中的版本3必须换成刚读取的实际值：

```sh
python3 scripts/commonplace.py --credential /private/path/credential.json profile
python3 scripts/commonplace.py --credential /private/path/credential.json profile-update --expected-revision 3 --name '用户指定的名字'
python3 scripts/commonplace.py --credential /private/path/credential.json profile-update --expected-revision 4 --reset-name --avatar-url ''
```

伙伴名片：`upsert_ai_partner(key, expected_revision, application?, name?, bio?, avatar_url?, show_on_profile?)`；创建时必须有可确认的application，名称缺省为应用名，简介缺省空，头像缺省几何图。只按用户需求修改昵称、简介与自定义头像；先读已有伙伴再决定创建或更新，不把示例key当成每次都要新建。

```sh
# 仅在尚无对应伙伴、且需要登记时创建；key可按真实客户端选择：
python3 scripts/commonplace.py --credential /private/path/credential.json partner --key codex-local --application Codex --name '本地 Codex' --expected-revision 0
```

作品署名：另将真实参与者数组传入publish_website/prepare_upload/submit_website；CLI用--ai-partners文件。最多8个，key不可重复；示例文件内容：

```json
[{"key":"codex-local","application":"Codex","contribution":"内容整理、页面设计与交互开发"}]
```

model仅在实际可确认时加到该数组元素，未知省略；它与contribution属于本件记录，不能传给伙伴名片接口。已登记伙伴的名字/头像要用upsert_ai_partner更新，作品数组中的name不会覆盖旧名片。改伙伴资料后已有署名按伙伴ID显示新名字，不必为改名重发所有作品。

登记伙伴不自动补任何作品署名。旧作只有用户明确确认参与者后才能据此处理，不能因为当前客户端是Codex就推断过去也是。明确的一次历史参与确认不等于其他作品或账号的通用事实。

主页开启后，有profile/public作品署名的伙伴会显示；show_on_profile=true可在没有作品署名时按明确需求独立展示。false只取消独立展示，不能隐藏仍有公开作品署名的伙伴；清空作品参与记录需要更新该作品。没有删除伙伴身份工具，AI不能开启主页。自定义头像需公开HTTPS图片，不用私有鉴权URL；人类或伙伴简介须用户提供或确认。

## 7. 独立素材的上传、更新与权限

```sh
python3 scripts/commonplace.py --credential /private/path/credential.json assets /path/to/photo.jpg --slug photo-one --title '照片说明'
python3 scripts/commonplace.py --credential /private/path/credential.json show WORK_ID
python3 scripts/commonplace.py --credential /private/path/credential.json asset-visibility WORK_ID --expected-version VERSION --expected-revision 2 --visibility public
```

新上传默认private；示例最后一行仅在用户明确同意公开时执行，版本和revision从最新show读取。MCP对应upload_asset与set_asset_visibility。改权限不上传新文件，不能用于网页依赖；反向改private使用同样的版本保护。修改后核对本人列表和匿名/本人访问结果。

assets更新可用同一receipt加--update，或指定work_id/expected_version；上传新版时明确传要保留的权限，别假设省略visibility沿用旧值。CLI public用--public，MCP用visibility=public。private URL需要本人会话或密钥，不是匿名引用链接；网页依赖随公开网页可访问。公开素材不等于授予开放许可。

私有稳定入口 `/api/v1/me/assets/{work_id}`，版本文件 `/api/v1/me/files/{version}/{path}`。如果用户只要修改权限，不应另建素材副本或重传。更换文件内容仍创建新版本。

## 8. 展示、归档和永久删除

只改listing：get_work → set_work_listing(work_id, expected_version, expected_revision, listing)，CLI `listing ID --expected-version VERSION --expected-revision N --listing profile`。改以后默认值：set_publish_preferences(default_listing)，CLI `preferences --default-listing profile`；不改已有作品或主页开关。

只下架：archive_work或CLI `archive ID --expected-version VERSION`；外站也可withdraw。立即关闭访问，但保留历史和额度，没有通用自动恢复入口。

永久删除：get_work → delete_work(work_id, expected_version, confirm=true)，CLI `delete ID --expected-version VERSION --confirm`；无当前版本的新作品草稿用null/CLI draft。返回deleted=false则按原参数继续，直到deleted=true；之后核对历史链接、本人列表、目录和额度。共享文件受保护，地址占用记录保留，旧地址不转给别人。

超时可安全重试同一操作；版本/归属/权限错误先读取解决，不盲目无限重试。过期草稿24小时后不能提交，也不会自动释放存储：废弃的新作品草稿可永久删除；已发布作品的单份未提交草稿版本没有普通用户单独清理接口，不能因此删除整份正式作品。

## 9. 稳定地址与平台边界

新托管作品自动使用 `https://content.texopub.com/p/{public_slug}/`，请求slug只用小写英文字母、数字、连字符，最多64字符；重名可自动短后缀，交付实际返回url。更新保持同一work_id/slug/身份，分类不进入路径。多页子页可用作品根下的真实路径并核验；`/v/{version}/`和`/_texopub/content/v/`是版本/内部资源路径，不作随更新变化的作品主页。

苏博 `https://texopub.com/p/suzhou-museum/` 保留兼容地址，已经迁入真实账号并可按云端当前版本更新；它不是待迁移的无归属静态条目。不要另建同名副本或强行搬域名。

平台标题栏和作品是独立区域：房屋轮廓内T标志回TexoPub，居中显示当前HTML标题，下滑收起、上滑或顶部柄恢复；作品自己的目录、搜索、大字、播放等留在iframe内，不需为平台栏改top或制作重复返回入口。外站不加外壳。

服务在读取时提供外壳和标题/滚动通信脚本，R2原文件保持；公开上传iframe不含allow-same-origin，不能访问平台DOM。平台核对消息窗口、纯文本标题和同作品路径。旧所有者静态案例保持既有交互及存储能力；不泛化删除其他作品已有控件。包内引用保持相对路径，不手工注入服务内部基址。

## 10. 验收与限制

提交成功后回读实际work/版本/范围，核对入口、图标、分类、封面和真实参与信息。按listing检查正确的本人/主页/发现集合；独立素材按权限核对本人库、公开索引及下载原字节。平台栏与作品交互分开验证，有子页则实际打开一页。目录摘要或一次HTTP200不等于验证交互、手机或原件质量。

- REST/CLI/分步上传：单文件25MiB、总100MiB、250文件；HTML正文2MiB、图标1MiB。一键MCP的8文件/32MiB及3MiB JSON限制见第4节。
- 空间默认512MiB预留额度，含草稿和历史版本；每日默认20次新会话，实际以本人me和服务返回为准。
- 云端目录查询上限当前为1000份作品、2000条素材，旧案例兼容项可额外合并；不保证无限容量或无限翻页。
- 不运行用户后端；新网页独立origin沙箱下localStorage/cookie、Service Worker、同源登录或部分弹窗导航能力受限。外部网站沿用原环境。
- 大视频分片、外站定时巡检、自定义域名绑定尚无普通用户工具；MCP发布与更新已经提供，不能写成“MCP未提供”。
- 401需要恢复本人连接/凭证，403核对scope/归属，409核对version/revision/幂等内容，413调整包结构或选择分步，429遵守服务限流。未经用户同意不有损压缩原件。

新测试作品验收后永久删除并核实清理；不要把测试网页长期留在正式目录。保留少量回执/日志，凭证、Cookie和原始个人文件不进入公开包。
