"""Verify original media extraction and safe static reference rewriting."""
import base64, importlib.util, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('remote',Path(__file__).resolve().parents[1]/'scripts/remote_publish.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class ResourceTests(unittest.TestCase):
 def test_all_media_extract_without_conversion(self):
  for mime,ext in [('image/png','.png'),('video/mp4','.mp4'),('audio/wav','.wav')]:
   raw=b'\x00ORIGINAL\xff'+mime.encode();uri='data:'+mime+';base64,'+base64.b64encode(raw).decode();result=m.extract_embedded({'index.html':('<source src="'+uri+'">').encode()});names=[p for p in result if p.endswith(ext)];self.assertEqual(len(names),1);self.assertEqual(result[names[0]],raw);self.assertNotIn(uri.encode(),result['index.html'])
 def test_rewrite_css_srcset_json_and_queries(self):
  data={'index.html':b'<img src=a.png><img srcset="a.png 1x, b.png 2x"><video poster="a.png" src="clip.mp4?t=1#x"></video>','nested/a.css':b'.x{background:url(../a.png)}','data.json':b'{"sound":"sound.wav"}'}
  def resolve(name,url):return 'https://cdn.example/'+url if url.split('?')[0].split('#')[0].endswith(('.png','.mp4','.wav')) else None
  result=m.replace_resource_urls(data,resolve);self.assertIn(b'src=https://cdn.example/a.png',result['index.html']);self.assertIn(b'https://cdn.example/b.png 2x',result['index.html']);self.assertIn(b'https://cdn.example/clip.mp4?t=1#x',result['index.html']);self.assertIn(b'url(https://cdn.example/../a.png)',result['nested/a.css']);self.assertIn(b'https://cdn.example/sound.wav',result['data.json'])
 def test_resource_upload_failure_preserves_input_and_does_not_publish_page(self):
  payload={'index.html':b'<video src="clip.mp4"></video>','clip.mp4':b'original'}
  def request(api,path,*args,**kw):
   if path=='/v1/me/materials':return {'items':[]}
   raise m.Error('network failed')
  with patch.object(m,'request',side_effect=request):
   with self.assertRaisesRegex(m.Error,'network failed'):m.externalize_resources('https://api','token',payload,set())
  self.assertEqual(payload['clip.mp4'],b'original');self.assertIn(b'clip.mp4',payload['index.html'])
 def test_reuses_identical_owned_media_and_keeps_exact_dependency(self):
  payload={'index.html':b'<video src="clip.mp4?x=1#t=2"></video>','clip.mp4':b'original','unused.mp4':b'keep'};row={'kind':'asset','sha256':m.hashlib.sha256(b'original').hexdigest(),'bytes':8,'work_id':'a'*32,'version':'b'*32,'name':'v.mp4','url':'https://cdn.example/v.mp4'}
  with patch.object(m,'request',return_value={'items':[row]}) as req:
   result,refs=m.externalize_resources('https://api','token',payload,set())
  self.assertEqual(req.call_count,1);self.assertNotIn('clip.mp4',result);self.assertEqual(result['unused.mp4'],b'keep');self.assertIn(b'https://cdn.example/v.mp4?x=1#t=2',result['index.html']);self.assertEqual(refs,[{k:row[k] for k in ['work_id','version']}|{'path':'v.mp4'}])
 def test_collect_large_embedded_html_without_parsing_base64(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'index.html';p.write_text('<html><video src="data:video/mp4;base64,'+base64.b64encode(b'x'*3000000).decode()+'"></video></html>');self.assertEqual(m.collect(p)[2],[p.resolve()])
if __name__=='__main__':unittest.main()
