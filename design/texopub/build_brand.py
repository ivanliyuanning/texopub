"""Build the local TexoPub.ai identity proposal. No publishing or registry changes."""
from pathlib import Path
from html import escape
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

ROOT = Path(__file__).resolve().parent
COLORS = dict(brand='#C74727', paper='#FAF8F3', ink='#222B28', muted='#69736C',
              surface='#F0ECE4', line='#D8DCD4', green='#1E6B52', on_dark='#FFAD8F')
font = instantiateVariableFont(TTFont(ROOT / 'fonts/Manrope.ttf'), {'wght': 800}, inplace=False)
glyphs = font.getGlyphSet()
cmap = font.getBestCmap()
upem = font['head'].unitsPerEm


def lettering(text, size, x, baseline, color):
    paths = []
    previous = ''
    # Optical spacing for this wordmark, measured in ems.
    optical = {'Te': -.045, 'xo': -.012, 'oP': .012, 'Pu': -.012, '.a': .012}
    for char in text:
        x += optical.get(previous + char, 0) * size
        glyph = glyphs[cmap[ord(char)]]
        pen = SVGPathPen(glyphs)
        glyph.draw(TransformPen(pen, (size/upem, 0, 0, -size/upem, x, baseline)))
        paths.append(f'<path fill="{color}" d="{pen.getCommands()}"/>')
        x += glyph.width * size / upem
        previous = char
    return ''.join(paths), x


def mark(color):
    # A horizontal ribbon passes behind an uninterrupted vertical ribbon.
    return (f'<g fill="{color}">'
            '<rect x="6" y="12" width="16" height="12" rx="2.5"/>'
            '<rect x="26" y="12" width="12" height="44" rx="2.5"/>'
            '<rect x="42" y="12" width="16" height="12" rx="2.5"/>'
            '</g>')


def svg(body, width, height, title):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
            f'viewBox="0 0 {width} {height}" role="img" aria-label="{escape(title)}">'
            f'<title>{escape(title)}</title>{body}</svg>')


def wordmark(ink, accent, inline=False, mono=False):
    text, end = lettering('TexoPub', 72, 100, 77, ink)
    suffix, right = lettering('.ai', 72 if inline else 38, end + 8, 77 if inline else 45,
                              ink if mono else accent)
    content = f'<g transform="translate(5 11) scale(1.1)">{mark(ink if mono else accent)}</g>' + text + suffix
    return content, round(right + 12), 100


logos = {}
for name, ink, accent, inline, mono in [
    ('logo', COLORS['ink'], COLORS['brand'], False, False),
    ('logo-inline', COLORS['ink'], COLORS['brand'], True, False),
    ('logo-reverse', COLORS['paper'], COLORS['on_dark'], False, False),
    ('logo-mono', COLORS['ink'], COLORS['ink'], False, True),
]:
    body, width, height = wordmark(ink, accent, inline, mono)
    logos[name] = (body, width, height)
    (ROOT / f'{name}.svg').write_text(svg(body, width, height, 'TexoPub.ai'))

(ROOT / 'mark.svg').write_text(svg(mark(COLORS['brand']), 64, 64, 'TexoPub.ai 交织的 T'))
(ROOT / 'mark-mono.svg').write_text(svg(mark(COLORS['ink']), 64, 64, 'TexoPub.ai 单色标志'))
(ROOT / 'app-icon.svg').write_text(svg(
    f'<rect width="64" height="64" rx="14" fill="{COLORS["brand"]}"/>'
    f'<g transform="translate(4 3) scale(.875)">{mark(COLORS["paper"])}</g>', 64, 64,
    'TexoPub.ai 应用图标'))


def place_logo(name, x, y, width):
    body, intrinsic, _ = logos[name]
    return f'<g transform="translate({x} {y}) scale({width/intrinsic})">{body}</g>'


def txt(text, x, y, size=18, color=None, weight=400, anchor='start'):
    return (f'<text x="{x}" y="{y}" fill="{color or COLORS["ink"]}" font-size="{size}" '
            f'font-weight="{weight}" text-anchor="{anchor}" '
            'font-family="Noto Sans CJK SC, PingFang SC, sans-serif">' + escape(text) + '</text>')


board = [f'<rect width="1320" height="900" fill="{COLORS["paper"]}"/>',
         txt('TexoPub.ai / 品牌视觉提案', 64, 57, 17, COLORS['muted']),
         txt('02 — 2026.10.22', 1256, 57, 14, COLORS['muted'], anchor='end'),
         f'<path d="M64 83H1256" stroke="{COLORS["line"]}"/>',
         place_logo('logo', 255, 143, 810),
         txt('把你与 AI 做出的好作品，分享给更多人。', 660, 375, 26, anchor='middle'),
         txt('交织的 T · 墨色字标 · 朱橙 .ai', 660, 421, 16, COLORS['muted'], anchor='middle')]

swatches = [('brand', '朱橙 / 品牌与行动', 288), ('paper', '暖白 / 页面背景', 240),
            ('ink', '墨色 / 主要文字', 240), ('surface', '浅砂 / 轻量分区', 216),
            ('green', '辅助绿 / 分类与状态', 208)]
x = 64
for key, label, width in swatches:
    board += [f'<rect x="{x}" y="474" width="{width}" height="78" fill="{COLORS[key]}" '
              f'stroke="{COLORS["line"] if key == "paper" else COLORS[key]}"/>',
              txt(label, x, 581, 14, COLORS['muted']), txt(COLORS[key], x, 606, 13, COLORS['muted'])]
    x += width

board += [f'<rect x="64" y="652" width="652" height="164" rx="2" fill="{COLORS["ink"]}"/>',
          txt('深色背景', 88, 685, 12, COLORS['paper']),
          place_logo('logo-reverse', 180, 704, 416),
          txt('小尺寸与应用', 764, 675, 14, COLORS['muted']),
          f'<g transform="translate(763 715) scale(.25)">{mark(COLORS["brand"])}</g>',
          f'<g transform="translate(824 707) scale(.5)">{mark(COLORS["brand"])}</g>',
          f'<g transform="translate(907 691)">{mark(COLORS["brand"])}</g>',
          f'<rect x="1080" y="692" width="64" height="64" rx="14" fill="{COLORS["brand"]}"/>',
          f'<g transform="translate(1084 695) scale(.875)">{mark(COLORS["paper"])}</g>',
          txt('16 px', 758, 792, 12, COLORS['muted']), txt('32 px', 821, 792, 12, COLORS['muted']),
          txt('64 px', 918, 792, 12, COLORS['muted']), txt('头像 / 图标', 1077, 792, 12, COLORS['muted']),
          txt('亲切、清楚、有活力。让作品成为主角。', 64, 868, 14, COLORS['muted']),
          txt('本地预览 · 尚未应用到线上网站', 1256, 868, 12, COLORS['muted'], anchor='end')]
(ROOT / 'preview.svg').write_text(svg(''.join(board), 1320, 900, 'TexoPub.ai 品牌配色与标志方案'))

(ROOT / 'tokens.css').write_text('''/* TexoPub.ai identity proposal v0.2. Local preview only. */
:root {
  --brand: #C74727;
  --paper: #FAF8F3;
  --ink: #222B28;
  --muted: #69736C;
  --surface: #F0ECE4;
  --line: #D8DCD4;
  --green: #1E6B52;
  --on-dark: #FFAD8F;
}
''')
print('Generated 8 vector assets and tokens; primary wordmark:', logos['logo'][1], '× 100')
