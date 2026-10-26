"""Build the four original typographic Xiaohongshu launch cards (1080 x 1440)."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont,ImageOps
ROOT=Path(__file__).resolve().parents[2]
OUT=Path(__file__).resolve().parent/'images';OUT.mkdir(exist_ok=True)
W,H=1080,1440
PAPER='#FAF8F3';INK='#202C27';MUTED='#6A716B';ORANGE='#C74727';GREEN='#203D30';LINE='#DEDCD3'
FONT='/System/Library/Fonts/STHeiti Medium.ttc';LIGHT='/System/Library/Fonts/STHeiti Light.ttc'
def f(n,bold=False):return ImageFont.truetype(FONT if bold else LIGHT,n)
def txt(d,xy,text,n=30,color=INK,bold=False):d.text(xy,text,font=f(n,bold),fill=color,stroke_width=0)
def base(n,kicker):
 im=Image.new('RGB',(W,H),PAPER);d=ImageDraw.Draw(im)
 logo=Image.open(ROOT/'templates/brand/app-icon-180.png').convert('RGBA').resize((56,56));im.paste(logo,(64,57),logo)
 txt(d,(136,65),'TexoPub',34,bold=True);txt(d,(64,163),kicker,25,ORANGE,True)
 d.line((64,1350,1016,1350),fill=LINE,width=2);txt(d,(64,1373),'人类与 AI 的共创社区',22,MUTED);txt(d,(902,1373),f'{n:02d} / 04',22,MUTED)
 return im,d
def panel(d,box,fill='#F0EDE5',outline=None,r=24):d.rounded_rectangle(box,radius=r,fill=fill,outline=outline,width=2)
def save(im,n):im.save(OUT/f'{n:02d}.png',optimize=True)
im,d=base(1,'一个把网页发布出去的 Skill')
txt(d,(64,246),'AI 做的网页',88,bold=True);txt(d,(64,365),'发给别人看。',100,ORANGE,True)
txt(d,(68,530),'从聊天框里的成品，到可分享的网址。',34,MUTED)
panel(d,(64,660,1016,1117),GREEN)
txt(d,(110,710),'index.html',48,'#FAF8F3',True);txt(d,(110,784),'+ 图片 / CSS / 脚本 / 子页',28,'#C3D3C6')
d.line((115,886,925,886),fill='#8FAF9B',width=3);d.polygon([(925,886),(905,875),(905,897)],fill='#8FAF9B')
txt(d,(110,937),'一个网址，就能打开。',48,'#FAF8F3',True);txt(d,(110,1016),'后续更新，保留原地址。',31,'#C3D3C6')
txt(d,(68,1190),'发布网页   ·   分享作品   ·   原地址更新',32,bold=True)
save(im,1)
im,d=base(2,'导览、阅读伴页与交互工具')
txt(d,(64,243),'这些已经发出去了。',66,bold=True)
items=[('苏州博物馆图文导览','图文阅读 / 搜索 / 目录','museum'),('《罪与罚》人物随手查','七组译本 / 异译名检索','book'),('四川大学博物馆导览','馆藏图文 / 来历与背景','nature')]
for n,(title,desc,kind) in enumerate(items):
 y=405+n*270;panel(d,(64,y,1016,y+230),'#F0EDE5')
 if kind=='museum':
  photo=ImageOps.fit(Image.open(ROOT/'next/data/suzhou-cover.jpg').convert('RGB'),(210,230));im.paste(photo,(64,y))
 else:
  panel(d,(64,y,274,y+230),GREEN if kind=='book' else '#E7C5A5')
  txt(d,(105,y+65),'文' if kind=='book' else '物',89,'#FAF8F3' if kind=='book' else GREEN,True)
 txt(d,(310,y+50),title,34,bold=True);txt(d,(310,y+118),desc,26,MUTED);txt(d,(310,y+165),'打开网址，直接使用 →',26,ORANGE)
txt(d,(68,1260),'静态网页可以有完整交互，也可以有多个页面。',29,MUTED)
save(im,2)
im,d=base(3,'给已经在用 Agent 做网页的人')
txt(d,(64,243),'用起来，三步。',76,bold=True)
for number,y,title,desc in [(1,405,'让 AI 读取 Skill','地址在下方，或从 GitHub 查看源码。'),(2,595,'登录并授权自己的空间','本地 Agent 用密钥；MCP 连接用 OAuth。'),(3,785,'把成品和发布要求交给它','先选展示范围，再拿到可分享的网址。')]:
 d.ellipse((64,y,126,y+62),fill=ORANGE);txt(d,(83,y+9),str(number),34,'#FFFFFF',True);txt(d,(158,y+1),title,40,bold=True);txt(d,(158,y+70),desc,29,MUTED)
panel(d,(64,1010,1016,1250),GREEN)
txt(d,(102,1048),'texopub.com/for-ai/SKILL.md',34,'#FFFFFF',True)
txt(d,(102,1125),'“把这个网页发布到我的 TexoPub 空间，',30,'#DCE8DF');txt(d,(102,1178),' 先核对我的身份和展示范围。”',30,'#DCE8DF')
save(im,3)
im,d=base(4,'发布以后，还能继续修改')
txt(d,(64,240),'更新内容，',88,bold=True);txt(d,(64,359),'不用换链接。',88,ORANGE,True)
panel(d,(64,528,1016,754),GREEN);txt(d,(104,575),'“把刚才的网页更新一下，',42,'#FAF8F3',True);txt(d,(104,649),'  保留原网址。”',42,'#FAF8F3',True)
txt(d,(64,825),'权限也讲清楚',39,bold=True)
for y,text in [(903,'网页展示三档：不展示 / 仅个人主页 / 公开'),(964,'三档链接都能访问；不展示 ≠ 私密网页'),(1025,'独立素材默认私有，明确同意后才公开')]:txt(d,(68,y),text,29,MUTED)
d.line((64,1102,1016,1102),fill=LINE,width=2)
txt(d,(68,1132),'开源：github.com/ivanliyuanning/texopub',28,ORANGE,True)
txt(d,(68,1194),'当前新账号需大陆手机号；已绑定邮箱可登录。',25,MUTED)
txt(d,(68,1240),'ChatGPT 使用自定义 MCP，能否添加取决于账号。',25,MUTED)
save(im,4)
print('Created four 1080x1440 PNG cards in',OUT)
