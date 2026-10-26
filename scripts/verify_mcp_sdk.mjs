import {Client} from '../.tools/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import {StreamableHTTPClientTransport} from '../.tools/node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js';
import {setGlobalDispatcher,EnvHttpProxyAgent} from '../.tools/node_modules/undici/index.js';
setGlobalDispatcher(new EnvHttpProxyAgent());
let raw='';for await (const chunk of process.stdin)raw+=chunk;
const {access_token}=JSON.parse(raw);
const client=new Client({name:'TexoPub SDK acceptance',version:'0.1.0'});
try{
 await client.connect(new StreamableHTTPClientTransport(new URL('https://texopub.com/api/mcp'),{requestInit:{headers:{Authorization:'Bearer '+access_token,'User-Agent':'TexoPub-MCP-Acceptance/0.1'}}}));
 const {tools}=await client.listTools();if(tools.length!==15)throw Error('Unexpected tool count');
 const r=await client.callTool({name:'get_my_space',arguments:{}});if(r.isError||!r.structuredContent?.publisher_id)throw Error('Account read failed');
 console.log(JSON.stringify({sdk_client_connected:true,tools:tools.length,own_space_read:true}));
}finally{await client.close();}
