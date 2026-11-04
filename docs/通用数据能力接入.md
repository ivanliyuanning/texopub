# TexoPub 通用数据能力

状态：2026-11-05作者登录即用、日预算与初始草稿恢复已上线并实际验收，见[本轮修复交接](https://github.com/ivanliyuanning/texopub/blob/main/docs/作者免连接数据修复与素材库交接-20261105.md)。已按用户2026-11-04明确决定正式上线，生产API、独立D1与本人试用已启用；数据OAuth须本人明确授权，不能自动扩旧scope；本人现有连接已完成新工具实调。上线与客户端验收证据见[云端数据上线记录](https://github.com/ivanliyuanning/texopub/blob/main/docs/云端数据上线记录-20261104.md)。基于Workers + 独立D1 + 现有R2，不运行用户自带服务器程序，不接受任意SQL。首轮按明确的发布者ID白名单启用，不开放全站注册即用。

## 能覆盖的需求

给托管网页提供有字段约束、可查询、可修改、跨设备保留的小型业务记录：内容条目、表单结果、个人状态、收藏和标注、任务及业务对象、设置和历史。网页可以同时使用三种集合；不以装修或某一种业务命名服务。复杂关系分析、全文检索、高并发聊天室、任意用户代码执行不在首轮能力中。外部数据库网站可继续调用其自己的HTTPS接口，需其服务允许相应跨域访问；静态托管不会运行随包上传的后端。

## 额度与成本边界

| 项目 | 首轮额度 |
| --- | --- |
| 文件空间 | 新账号默认5GiB；旧账号保留原额，发布时另为试用本人调整；包含历史版本与有效草稿 |
| 数据空间 | 50MiB/账号，25MiB/作品，3个数据应用 |
| 记录数 | 20,000/账号；10,000/应用；5,000/集合 |
| 集合/字段/索引 | 10集合/应用、32字段/集合、3索引/集合，每索引1–2字段 |
| 请求/响应 | 请求128KiB、记录64KiB、响应256KiB；单个文本或JSON字段32KiB |
| 分页 | 1–50条，默认20；按id升序、游标翻页；字段投影 |
| 查询 | 无条件分页，或完整匹配一个已声明索引的等值条件；不接受扫描、任意排序、SQL、全文查询 |
| 历史 | 显式开启；至多5个旧版本、7天，计入数据空间；定时分批清理过期历史 |
| 账号日请求 | 读取2,000次、写入500次，同时受操作预算约束 |
| 账号日预算 | 读取300,000单位、写入30,000单位；UTC零点重置 |
| 平台日预算 | 8,000次，读取1,000,000单位、写入30,000单位 |
| 作者运行时 | 平台有效登录直接使用；每次核验作品当前版本及归属，无独立grant/窗口 |
| 访客连接 | user_private显式连接最多20个；最长2小时、闲置30分钟；签名上下文1小时 |
| 数据密钥 | 最多10个有效密钥、1–180天、明确权限及应用范围 |

数据库额度使用UTF-8记录字节 + 每记录512字节 + 每个声明索引2KiB预留；历史按旧记录计，配置也计额。它是产品的容量计量，不等于D1文件的精确体积。图片、音视频、附件本体存R2；数据库只放已发布文件的引用或HTTP(S)网址，不允许data URL。小段代码是文本，受同样字节限制，不会被服务执行。

日预算是保守操作单位，不是假称Cloudflare真实计费行数：普通调用预留64读取单位、查询128；读请求4写入单位，写请求32写入单位。元数据、历史及索引会影响真实行数。容量由D1事务和CHECK约束原子限制；日预算也用事务预留。单账号完整2,000次查询加500次写入预留288,000读取、24,000写入单位，可落在账号预算内；全站共享预算、限频和容量仍独立生效。失败验证、冲突和重试也可能消耗请求预算。大批量删除分批完成，也受预算限制，不能承诺瞬时清空大型空间。

首轮保持现有Cloudflare订阅，不自动购买/升级、不假设每账号都预占满容量。R2既有存储及请求计费规则仍适用；数据库/API在现有免费额度内可能无新增账单，但本功能不承诺无限免费或Cloudflare账单绝对上限。现有Cloudflare层的全账号额度、实际物理体积及其他Worker流量还需监控。数据白名单、IP限频绑定、产品日额度和批量清理一起控制试用规模；增长后先复核实际指标再调额或升级。

## 权限

| 模式 | 网页运行时读取 | 网页运行时写入 |
| --- | --- | --- |
| owner | 已登录的作者 | 已登录的作者 |
| public_read | 任何人，无需连接 | 已登录的作者 |
| user_private | 连接后的访客，仅自己的记录 | 连接后的访客，仅自己的记录 |

作者通过明确授权的数据管理API/AI可管理该作品全部记录，包括访客记录；user_private不向作者隐藏。授权弹窗对此明示。账号、作品、集合、访客归属都在服务端判断，网页传来的subject_id不会用作运行时身份。不同作者不能借猜ID读取他人应用。

作品仍在不含allow-same-origin的iframe沙箱。SDK只向受信平台外层发送业务操作；外层从content.texopub.com以credentials:include请求主站的POST /runtime/author，服务端复用已有__Host-texopub登录，严格校验平台Origin、自定义请求头、当前作品版本/绑定、作者归属和应用状态。Cookie仍为主站HttpOnly、Secure、SameSite=Lax，不发给作品。CORS仅允许平台配置的精确来源；Origin:null及外站不能使用此接口，管理API的同源限制保持。

作者无需点击连接、独立授权或保留弹窗。直接调用collection接口即可；可选await TexoPubData.ready()（connect兼容）返回{connected:true,state:'ready',role:'author'}。未登录返回login_required，错误含login_url，平台显示登录入口，经统一登录返回同一作品；其他账号返回forbidden。SDK错误保留code、state、reset_at等字段。退出/过期、旧版本、下架、配置变化及暂停均逐次拒绝；刷新/新标签/正常程序更新自动使用当前绑定，同一app的数据继续保留。作者签名ticket是公开作品上下文，当前版本有效时可持续使用；每次仍必须有有效的作者登录，并非长期登录凭证。

user_private的其他访客仍使用本人确认的短期grant及受信MessageChannel窗口；只有此访客通道依赖窗口存活。作者不依赖该通道。主站与内容站必须使用同站HTTPS子域；其他域名或第三方嵌入下浏览器Cookie策略可能拒绝登录态，不能将其等同于受支持的作者直接访问。手机及微信内置浏览器尚未完成验收。

旧发布凭证无数据权限。OAuth新增 `texopub:data:read`、`texopub:data:write`、`texopub:data:manage`，旧授权不扩权，必须重新明确同意；当前OAuth数据授权覆盖账号内当前及未来应用，授权页明示。数据密钥可选单应用或全部当前及未来应用，三种权限独立；不具有发布网站或账号管理权。密钥仅在本人主站设置创建，要求15分钟内验证，明文只返回一次。

网页展示范围listing继续只控制目录收录，与集合权限分开。公开读取的数据本身无需登录，不能将其称为私密。

## API

基础地址 `https://texopub.com/api/v1/data`；数据密钥使用 `Authorization: Bearer txd_…`。浏览器管理请求须主站cookie、同源Origin与 `X-TexoPub-Request: space`。错误为 `{error:{code,message,...}}`；版本冲突409，缺少版本/幂等键428，请求过大413，字段无效422，日额/限频429，容量507。

| 方法与路径 | 权限 | 用途 |
| --- | --- | --- |
| GET /capabilities | 匿名 | 版本和限制 |
| GET /sdk.js | 匿名 | 网页SDK |
| GET /usage | read | 数据与文件分别计额、今日预算 |
| GET /apps | read | 应用列表及配置 |
| POST /apps | manage，全部应用范围 | `{work_id}`，仅本人已托管网页 |
| GET /apps/{app} | read | 当前/待发布配置、集合revision、发布绑定 |
| POST /apps/{app}/config | manage | `{expected_revision:pending_revision,collections}`；返回data_binding |
| POST /apps/{app}/state | manage | `{state:active或paused,expected_revision:应用revision}` |
| GET /apps/{app}/grants | manage | 连接列表，不返回会话或登录信息 |
| POST /apps/{app}/grants/revoke | manage | `{id}`，立即撤销后续调用 |
| POST /apps/{app}/delete | manage | `{confirm:true,expected_revision}`；deleting继续同参 |
| POST /apps/{app}/collections/{key}/query或export | read | `{limit,where,fields,cursor}`，next_cursor=null结束 |
| POST …/get | read | `{id}` |
| POST …/history | read | `{id}`，只返回尚有效的历史 |
| POST …/create | write | `{data,idempotency_key}`；管理新增user_private还需账号subject_id |
| POST …/update | write | `{id,expected_revision,data}`，完整替换业务字段 |
| POST …/restore | write | `{id,expected_revision,history_revision}`，恢复生成新revision |
| POST …/remove | write | `{id,expected_revision}`，同时删该记录的历史 |
| POST …/clear_history | write | `{id,expected_revision,confirm:true}` |
| POST …/delete | manage | `{expected_revision:集合revision,confirm:true}`，分批删集合记录/历史和引用；随后移除配置并重新发布 |
| GET/POST /credentials | 本人浏览器 | 列表/创建/撤销；AI数据凭证不能代创密钥 |
| GET /console | 页面 | 本人查看用量、状态、数据凭证 |

`read/write/manage`是上面完整OAuth scope或独立数据密钥权限的简写。创建幂等键保留24小时；同键不同内容409；记录已删除后同键不会复活。查询游标绑定条件、投影、访客和集合变更序列，数据变化返回409，导出要重新开始，不能把部分文件当完整导出。

`/runtime/info`、`/runtime/grant`、`/runtime/call`、`/runtime/disconnect`由平台桥接使用。签名viewer ticket只表示作品、版本和来源；它不是账号凭证。非公开操作还必须通过主站会话和grant校验，旧网页版本不能访问新版本数据。

## 字段与发布

支持string、number、boolean、datetime（UTC ISO）、enum、url（HTTP(S)，不含登录凭证）、json（8层/512节点）和asset_ref。字段可声明required、nullable、max_bytes、number的min/max，enum的values。无声明字段拒绝；索引仅标量字段，索引文本256字节以内。已有记录的字段、访问模式、索引不能破坏性改变；可添加可选字段，其他变更先明确导出和迁移。

```json
{"notes":{"mode":"owner","history":true,"fields":{"title":{"type":"string","required":true,"max_bytes":1000},"done":{"type":"boolean"}},"indexes":["done"]}}
```

先发布网页，再建应用、配置集合，最后完整更新同一网页，在发布请求中加入返回的 `data_binding:{app_id,revision,config_hash}`。主站先提交作品版本，再幂等激活匹配的数据配置；中途失败时运行时拒绝不匹配绑定，提交重试可完成激活。配置不能被普通网页偷偷改动，作品绑定不得串用。普通更新省略data_binding沿用；数据应用永久删除后普通更新会解除旧绑定。历史网页仅保留文件，不允许继续读写当前数据。

```html
<script src="https://texopub.com/api/v1/data/sdk.js"></script>
<script type="module">
const notes = TexoPubData.collection('notes');
// 私有操作先调用connect，并按平台按钮在弹窗确认。
await TexoPubData.connect();
const {record} = await notes.create({title:'第一条记录',done:false}, crypto.randomUUID());
await notes.update(record.id,{title:'第一条记录',done:true},record.revision);
const page = await notes.query({where:{done:true},limit:20});
</script>
```

SDK同时有get、remove、history、restore、clearHistory、disconnect。公开读取不要求connect。新增超时重试必须复用原幂等键；版本冲突先读取当前记录再决定，不默认覆盖。

asset_ref为 `{work_id,version,path}`，必须是作者本人已发布的独立素材。记录与保留历史共同保护资源，至多关联8组素材；数据库操作失败不会使仍引用的素材被删除。跨D1引用采用作品/素材租约、保守预先pin、成功后同步及持久清理任务；服务异常可能短暂多保护素材，定时维护重试释放，不允许提前误删。

## CLI与MCP

独立凭证文件权限建议0600；不要把发布密钥当作数据凭证。

```sh
commonplace remote --credential data-credential.json data usage
commonplace remote --credential data-credential.json data apps
commonplace remote --credential data-credential.json data create-app --body create.json
commonplace remote --credential data-credential.json data config --app APP_ID --body config.json
commonplace remote publish site/ --data-binding binding.json ...
commonplace remote --credential data-credential.json data query --app APP_ID --collection notes --body query.json
commonplace remote --credential data-credential.json data export --app APP_ID --collection notes --output notes.jsonl
```

导出逐页写入`.partial`，完整成功后才产生目标文件，已有目标不覆盖。MCP增加8工具：get_data_usage、list_data_apps（可传app_id看详情）、create_data_app、configure_data_app、query_data_records、write_data_record、delete_data_record、manage_data_app。OAuth、工具清单、公开Skill/CLI/OpenAPI与包必须一起同步。部署不等于既有插件已更新；刷新既有连接工具，并在新对话实际调用后才能声称插件端到端完成。

## Cloudflare发布与回退清单

1. 保留当前生产Worker脚本、绑定、Pages版本和源码提交；不得打印/改写现有SMS、邮箱和OAuth秘密。
2. 新建独立D1（建议`texopub-data`），应用`service/data-schema.sql`；原库只应用`service/migrations/0010_structured_data.sql`，原作品数据不搬迁。
3. API Worker增加DATA_DB绑定、明确本人DATA_PUBLISHERS白名单、随机DATA_BRIDGE_SECRET；内容Worker仅配置相同桥接secret，不绑定DATA_DB。保留各自原来的DB/FILES等绑定。
4. API建议绑定DATA_RATE_LIMITER（本功能每IP60次/60秒），增加每15分钟维护Cron。`dataMaintenance`清理过期历史、幂等记录、连接、日账和pin任务；维护必须使用API角色。没有配置限频绑定时不可把IP限频称为已启用。
5. 构建新版Worker与Pages，先演练生产绑定/原作品回归；为试用本人单独设文件额度5GiB，不自动修改其他旧账号。
6. 只使用少量虚构测试数据做线上读回、隔离、并发、历史、配额、断开与删除验收；永久清理所有测试网页版本、数据/历史/grants/pins和独占R2对象，核对额度。
7. Skill2.6.0/插件0.8.0、源码包、OpenAPI、SDK保持一致；既有连接刷新+新对话调用单独记录证据。手机和微信浏览器另验。
8. 回退代码可禁用入口和白名单；新增D1与兼容主库表不随Git自动消失。保留正式数据，先导出再处理迁移，不把回退代码当撤回数据库。

本地预览：`node scripts/data_preview.cjs`，打开`http://localhost:8789/preview/login?as=author`。所有账号、数据库、文件均是隔离的虚构预览，不连接生产；进程内保留，重启重建。直接输入后点新增，平台将显示虚构身份选择；确认后自动续存，取消保留输入。本地演示的无弹窗适配不进入生产Worker，不能代替正式域名作者会话及访客授权验收。

## 初始上传草稿恢复

一键MCP发布先验证HTML显式head，失败不创建草稿。分步上传仍可能留下初始draft；用get_work读取version:null，以原work_id、expected_version:null和新的idempotency_key提交修正后的完整清单。CLI使用--expected-version draft；REST明确传null。已有发布版本不能传null，其他作者不能恢复该草稿。发生文件校验失败时MCP一键发布错误提供work_id/upload_id以便恢复；草稿及其文件仍计入额度，按既有永久删除流程处理遗留测试内容。
