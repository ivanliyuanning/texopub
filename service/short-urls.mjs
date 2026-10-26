// A single global public namespace; names stay reserved for the life of a work.
export function shortCandidate(slug,workId,attempt=0){
 const reserved=slug==='suzhou-museum'||/^[a-f0-9]{32}$/.test(slug);
 if(attempt===0&&!reserved)return slug;
 const index=Math.max(0,attempt-(reserved?0:1));
 const suffix=workId.slice(0,Math.min(6+index*4,32))+(index>7?index.toString(36):'');
 return slug.slice(0,63-suffix.length).replace(/-+$/,'')+'-'+suffix;
}
