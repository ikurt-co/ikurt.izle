const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const token=fs.readFileSync(path.join(os.homedir(),'.wrangler/config/default.toml'),'utf8').match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
(async()=>{
const body={name:'IKURT IZLE Admin',type:'self_hosted',domain:'ikurt-izle.tarik-c8b.workers.dev/admin',destinations:[{type:'public',uri:'ikurt-izle.tarik-c8b.workers.dev/admin'},{type:'public',uri:'ikurt-izle.tarik-c8b.workers.dev/api/admin'}],session_duration:'1h',http_only_cookie_attribute:true,same_site_cookie_attribute:'lax',policies:[{name:'Only Tarik',decision:'allow',precedence:1,include:[{email:{email:'tarik@ikurt.net'}}],require:[],exclude:[]}]};
const r=await fetch('https://api.cloudflare.com/client/v4/accounts/c8ba338b6633eb47ee462b564aef9c94/access/apps',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(d.success)fs.writeFileSync('.wrangler/access-app.json',JSON.stringify(d.result,null,2));console.log(JSON.stringify({status:r.status,success:d.success,id:d.result?.id,aud:d.result?.aud,domain:d.result?.domain,errors:d.errors}));
})();
