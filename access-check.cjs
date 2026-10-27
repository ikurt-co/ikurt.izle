const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const raw=fs.readFileSync(path.join(os.homedir(),'.wrangler/config/default.toml'),'utf8');
const token=raw.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
const account='c8ba338b6633eb47ee462b564aef9c94';
(async()=>{for(const endpoint of ['access/organizations','access/apps','workers/subdomain']){const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/${endpoint}`,{headers:{Authorization:`Bearer ${token}`}});const d=await r.json();console.log(JSON.stringify({endpoint,status:r.status,success:d.success,result:endpoint==='access/apps'?d.result?.map(x=>({id:x.id,name:x.name,domain:x.domain,aud:x.aud})):d.result,errors:d.errors}));}})();
