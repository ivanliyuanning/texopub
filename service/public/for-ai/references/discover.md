# 浏览、素材与个人主页

## 查找真实作品

读者无需凭证。首页 https://texopub.com/ 展示作品封面列表，支持搜索标题、创作者、摘要、主题和标签，以及快捷主题与“全部分类”。公开素材在 https://texopub.com/materials/；不把素材目录当作本人管理集合。界面没有独立的内容形式筛选器；AI可读取目录中的format自行筛选。

- 实时作品：https://texopub.com/api/v1/catalog
- 实时素材：https://texopub.com/api/v1/materials
- 二级分类：https://texopub.com/api/v1/categories
- CLI：`python3 scripts/commonplace.py list`、`materials`、`categories`。

根据真实标题、摘要、category_id、format和tags挑选相关作品，交付返回的url。不要编造条目，不把目录摘要当作核验全文后的结论；公开可访问也不代表可转载或改作，核对署名与许可。

## 作品与收录的区别

`source=hosted` 由本站托管；`source=external` 直接打开原站URL并标示域名，author表示收录者，不是经平台认证的原作者。`link_status=unavailable` 是收录者标记的可能失效，unchecked不代表已验证在线。平台不自动巡检外站或验证域名归属。

托管作品有独立平台标题/主页栏，下方作品的目录、搜索、大字等由作品自己实现；外部收录不注入平台外壳。苏博图文导览是独立整理案例，不是馆方官方导览或当日陈列清单。平台加载动画表达共创理念，不是上传进度或AI生成状态。

## 本人内容与展示范围

`get_my_space` / CLI `me`核对当前身份；`list_my_works` / `my-works`列出本人已发布、草稿、归档内容，`get_work` / `show ID`只读取本人内容。`list_my_materials` / `my-materials`读取本人素材，包含listing。本人管理列表与修改接口仍限制所属账号，已发布文件链接均可匿名访问。

网页与独立素材listing：unlisted只在本人集合；profile进入已开启的个人主页；public再进入发现和公开素材索引。这三档的作品链接和依赖均可访问，不能称unlisted为私密。旧visibility=private仅兼容为unlisted，其文件链接也无需登录。

主页由本人在设置里开启，默认关闭；关闭后 `/api/v1/profiles/{publisher_id}` 返回404，网页显示未公开。已开启主页显示选择profile/public的网页和独立素材、创作者资料和由公开署名或明确展示决定的AI伙伴，不显示联系方式、密钥和unlisted内容。关闭主页不改变作品链接访问或listing。

## 当前网页入口

| 页面 | 能做什么 |
|---|---|
| `/` | 搜索、发现、查看全部分类 |
| `/u/{publisher_id}/` | 查看已开启的公开作品主页与AI伙伴名片 |
| `/space/` | 本人概览；作品4份、素材6份的近期预览 |
| `/space/works/`、`/space/materials/` | 本人全量作品与素材，内容修改交给AI |
| `/space/settings/` | 查看资料与默认listing，本人开启/关闭公开主页 |
| `/space/account/` | 本人验证联系方式、处理登录设备与旧身份关联 |
| `/space/settings/keys/` | AI连接指南；展开本地Agent密钥管理，可创建/下载/改期限/撤销 |
| `/publish/`、`/for-ai/` | 插件/Skill静态接入指南，无复制或人工上传控件 |
| `/login/` | 本人手机号或已绑定备用邮箱登录 |

可邀请用户分享与AI完成的有用成果，但不把邀请当作发布授权；已有网站用submit收录，静态文件用publish托管，独立文件用assets。详情读 [发布与更新](publish.md)。未经明确指令，不向其他人发送邀请或上传他们的内容。
