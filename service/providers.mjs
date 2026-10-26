// Alibaba RPC signing uses Web Crypto; no account keys or OTPs are logged.
const enc=new TextEncoder();
const pct=v=>encodeURIComponent(String(v)).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
export async function rpcSignature(params,secret){
 const canonical=Object.keys(params).sort().map(k=>pct(k)+'='+pct(params[k])).join('&');
 const key=await crypto.subtle.importKey('raw',enc.encode(secret+'&'),{name:'HMAC',hash:'SHA-1'},false,['sign']);
 const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode('POST&%2F&'+pct(canonical))));
 return btoa(String.fromCharCode(...bytes));
}
async function rpc(env,service,action,params){
 const mail=service==='mail',kid=mail?(env.MAIL_ACCESS_KEY_ID||env.ALIYUN_ACCESS_KEY_ID):env.ALIYUN_ACCESS_KEY_ID,secret=mail?(env.MAIL_ACCESS_KEY_SECRET||env.ALIYUN_ACCESS_KEY_SECRET):env.ALIYUN_ACCESS_KEY_SECRET;
 if(!kid||!secret)throw new Error('provider_unconfigured');
 const data={Format:'JSON',Version:mail?'2015-11-23':'2017-05-25',AccessKeyId:kid,SignatureMethod:'HMAC-SHA1',SignatureVersion:'1.0',SignatureNonce:crypto.randomUUID(),Timestamp:new Date().toISOString().replace(/\.\d+Z$/,'Z'),Action:action,...params};
 data.Signature=await rpcSignature(data,secret);
 const endpoint=mail?(env.MAIL_ENDPOINT||'https://dm.aliyuncs.com/'):'https://dypnsapi.aliyuncs.com/';
 if(!/^https:\/\/(?:dm(?:\.[a-z0-9-]+)?|dypnsapi)\.aliyuncs\.com\/$/.test(endpoint))throw new Error('provider_endpoint');
 const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(data),signal:AbortSignal.timeout(15000)});
 const raw=await r.text();if(raw.length>64000)throw new Error('provider_response');let result;try{result=JSON.parse(raw);}catch{throw new Error('provider_response');}
 if(!r.ok||(result.Code&&result.Code!=='OK')||result.Success===false)throw new Error('provider_failed');
 return result;
}
export function smsReady(env){return !!(env.ALIYUN_ACCESS_KEY_ID&&env.ALIYUN_ACCESS_KEY_SECRET&&env.SMS_SIGN_NAME);}
export function mailReady(env){return !!(env.MAIL_FROM&&(env.MAIL_ACCESS_KEY_ID||env.ALIYUN_ACCESS_KEY_ID)&&(env.MAIL_ACCESS_KEY_SECRET||env.ALIYUN_ACCESS_KEY_SECRET));}
export async function sendSms(env,phone,challenge){
 return rpc(env,'sms','SendSmsVerifyCode',{PhoneNumber:phone,CountryCode:'86',SignName:env.SMS_SIGN_NAME,TemplateCode:env.SMS_TEMPLATE_CODE||'100001',TemplateParam:JSON.stringify({code:'##code##',min:'5'}),SchemeName:'TexoPub',OutId:challenge,CodeLength:6,CodeType:1,ValidTime:300,Interval:60,DuplicatePolicy:1,ReturnVerifyCode:false,AutoRetry:0});
}
export async function checkSms(env,phone,challenge,code){
 const r=await rpc(env,'sms','CheckSmsVerifyCode',{PhoneNumber:phone,CountryCode:'86',SchemeName:'TexoPub',OutId:challenge,VerifyCode:code});
 return r.Code==='OK'&&r.Success===true&&r.Model?.VerifyResult==='PASS'&&r.Model?.OutId===challenge;
}
export async function sendMail(env,email,code){
 return rpc(env,'mail','SingleSendMail',{RegionId:env.MAIL_REGION||'cn-hangzhou',AccountName:env.MAIL_FROM,AddressType:1,ReplyToAddress:false,FromAlias:'TexoPub',ToAddress:email,Subject:'TexoPub 验证码',TextBody:`你的 TexoPub 验证码为 ${code}，5 分钟内有效。用于登录或绑定备用邮箱。请勿转发；如非本人操作，请忽略。`});
}
