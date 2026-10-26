from pathlib import Path
import shutil,json
root=Path(__file__).resolve().parents[2]
project=root/'next';dest=project/'dist';dest.mkdir(exist_ok=True)
for filename in ['index.html','preview.html']:
 shutil.copy2(project/'src'/filename,dest/filename)
for filename in ['app.mjs','identity.mjs','icons.mjs','style.css']:
 shutil.copy2(project/'src'/filename,dest/filename)
shutil.copytree(project/'data',dest/'data',dirs_exist_ok=True)
shutil.copy2(root/'taxonomy.json',dest/'data/taxonomy.json')
shutil.copytree(root/'templates/brand',dest/'brand',dirs_exist_ok=True)
print(json.dumps({'output':str(dest),'catalog_items':len(json.loads((dest/'data/catalog.json').read_text())['items'])}))
