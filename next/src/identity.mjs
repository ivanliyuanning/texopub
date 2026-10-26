export function seed(value){let h=2166136261;for(const c of String(value)){h^=c.codePointAt(0);h=Math.imul(h,16777619)}return h>>>0}
export function creatorName(id,name,lexicon){const explicit=String(name||'').trim();if(explicit&&explicit!=='新创作者')return explicit;const n=seed(id);return lexicon.prefixes[n%lexicon.prefixes.length]+lexicon.roles[Math.floor(n/lexicon.prefixes.length)%lexicon.roles.length]}
export function partnerName(partner){return String(partner.nickname||partner.application||'AI 伙伴').trim()||'AI 伙伴'}
export function avatarCells(id){let state=seed(id)||1;const cells=[];for(let y=0;y<5;y++)for(let x=0;x<3;x++){state^=state<<13;state^=state>>>17;state^=state<<5;if((state>>>0)&1)for(const col of new Set([x,4-x]))cells.push([col,y])}return cells.length?cells:[[2,2]]}
export function safeUrl(value){try{const u=new URL(value);return u.protocol==='https:'?u.href:''}catch{return ''}}
export function escape(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
