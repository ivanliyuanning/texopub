"""Compile English static UI strings; never translate runtime user content.

The Chinese templates are the source of truth. en.json contains reviewed phrases.
Missing translations fail the build, rather than silently ship a mixed UI.
"""
import json
import re
import shutil
from pathlib import Path

HAN = re.compile(r'[\u3400-\u9fff]')

def localize_community(root, target):
    source = root / 'templates/community'
    translations = json.loads((source / 'locales/en.json').read_text())
    pattern = re.compile('|'.join(re.escape(k) for k in sorted(translations, key=len, reverse=True)))
    english = target / 'en'
    english.mkdir(parents=True, exist_ok=True)
    for name in ['app.mjs', 'account.mjs', 'api.mjs', 'icons.mjs', 'identity.mjs', 'loading.mjs', 'locale.mjs']:
        text = (source / name).read_text()
        # The legacy-name sentinel is data, not an interface label.
        text = text.replace("explicit!=='新创作者'", "explicit!=='\\u65b0\\u521b\\u4f5c\\u8005'")
        text = pattern.sub(lambda m: translations[m[0]], text)
        if HAN.search(text):
            missing = sorted(set(re.findall(r'[\u3400-\u9fff]+', text)))
            raise ValueError(f'Missing English UI copy in {name}: {missing}')
        text = text.replace("'zh-CN'", "'en-US'")
        text = text.translate(str.maketrans({'。':'.','，':', ','：':': ','？':'?','（':'(', '）':')','；':'; '}))
        text = text.replace('  works', ' works').replace('  materials',' materials')
        if name == 'app.mjs':
            text = text.replace('>English</button>', '>中文</button>').replace('aria-label="Switch to English" lang="en"', 'aria-label="切换到中文" lang="zh-CN"')
            text = text.replace('https://texopub.com/for-ai/SKILL.md', 'https://texopub.com/for-ai/en/SKILL.md')
            text = text.replace("'/community/plugin.html'", "'/community/en/plugin.html'")
            text = text.replace("?'plugin':'privacy'", "?'en/plugin':'en/privacy'")
            text = text.replace("next.taxonomy]=await Promise.all([api('catalog'),api('categories')]);", "next.taxonomy]=await Promise.all([api('catalog'),api('categories')]);next.taxonomy=englishTaxonomy(next.taxonomy);")
            text = "import {englishTaxonomy,englishCategory} from './categories.mjs';\n" + text
            text = text.replace("(work.category_path||[]).at(-1)||'Co-created works'", "englishCategory(work.category_id,'Co-created works')")
            text = text.replace("(work.category_path||[]).at(-1)||work.category||'Uncategorized'", "englishCategory(work.category_id,'Uncategorized')")
            text = text.replace('work.summary,work.category,', 'work.summary,englishCategory(work.category_id,work.category),')
            text = "function workLink(value){const link=safeLink(value);if(!link)return link;const url=new URL(link);if(['texopub.com','content.texopub.com'].includes(url.hostname))url.searchParams.set('lang','en');return url.href}\n"+text
            text = text.replace('safeLink(work.url', 'workLink(work.url')
            # Only labels attached to category IDs are translated; titles, bios, files and names stay intact.
        if name == 'api.mjs':
            text = "import {englishMessage} from './messages.mjs';\n" + text
            text = text.replace("data.error ||", "englishMessage(data.error,response.status) ||")
            text = text.replace('  return data;', "  if(data.message)data.message=englishMessage(data.message,response.status);\n  return data;")
        (english / name).write_text(text)
    (english / 'messages.mjs').write_text('const messages='+json.dumps(translations,ensure_ascii=True)+';\nexport function englishMessage(message,status=400){if(!message)return message;if(messages[message])return messages[message];return [...String(message)].some(c=>c.codePointAt(0)>=0x3400&&c.codePointAt(0)<=0x9fff)?`Request could not be completed (HTTP ${status}). Please try again or verify your current account and content version.`:message}\n')
    shutil.copy2(source / 'locales/categories.mjs' , english / 'categories.mjs')
    for name in ['plugin', 'privacy']:
        shutil.copy2(root / f'templates/en/{name}.html', english / f'{name}.html')
