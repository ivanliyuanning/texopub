import contextlib, importlib.util, io, json, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('remote_data_client',Path(__file__).resolve().parents[1]/'scripts/remote_publish.py')
client=importlib.util.module_from_spec(spec);spec.loader.exec_module(client)
class DataClientTests(unittest.TestCase):
    def test_export_uses_all_pages_and_only_publishes_complete_file(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);cred=root/'cred.json';out=root/'export.jsonl';cred.write_text(json.dumps({'api':'https://example.test/api','token':'synthetic-data-key'}));calls=[]
            def request(api,path,token,body=None,method='GET',**kwargs):
                calls.append((path,body,method));return {'records':[{'id':str(len(calls))}], 'next_cursor':'page2' if len(calls)==1 else None}
            with patch.object(client,'request',request),contextlib.redirect_stdout(io.StringIO()):client.main(['--credential',str(cred),'data','export','--app','a'*32,'--collection','notes','--output',str(out)])
            self.assertEqual([json.loads(line)['id'] for line in out.read_text().splitlines()],['1','2']);self.assertEqual(calls[1][1]['cursor'],'page2');self.assertFalse(out.with_name(out.name+'.partial').exists());self.assertEqual(out.stat().st_mode&0o777,0o600)
    def test_stale_export_is_never_reported_as_complete(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);cred=root/'cred.json';out=root/'export.jsonl';cred.write_text(json.dumps({'api':'https://example.test/api','token':'synthetic'}));calls=[]
            def request(*args,**kwargs):
                calls.append(args)
                if len(calls)>1:raise client.Error('HTTP 409 cursor_stale')
                return {'records':[{'id':'one'}],'next_cursor':'page2'}
            with patch.object(client,'request',request),contextlib.redirect_stdout(io.StringIO()),self.assertRaises(client.Error):client.main(['--credential',str(cred),'data','export','--app','a'*32,'--collection','notes','--output',str(out)])
            self.assertFalse(out.exists());self.assertTrue(out.with_name(out.name+'.partial').exists())
    def test_collection_deletion_uses_manage_endpoint(self):
        with tempfile.TemporaryDirectory() as d:
            cred=Path(d)/'cred.json';cred.write_text(json.dumps({'api':'https://example.test/api','token':'synthetic'}));body=Path(d)/'body.json';body.write_text('{"expected_revision":1,"confirm":true}')
            with patch.object(client,'request',return_value={'deleted':True}) as request,contextlib.redirect_stdout(io.StringIO()):client.main(['--credential',str(cred),'data','delete-collection','--app','a'*32,'--collection','notes','--body',str(body)])
            self.assertEqual(request.call_args.args[1],'/v1/data/apps/'+'a'*32+'/collections/notes/delete');self.assertEqual(request.call_args.args[4],'POST')
