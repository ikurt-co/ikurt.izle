const base='https://ikurt-izle.tarik-c8b.workers.dev';
for(const path of ['/api/health','/admin','/api/admin/locations','/c/jgmh8FAVk8fZCa']) {
 const r=await fetch(base+path,{redirect:'manual',headers:{'Cache-Control':'no-cache'}});
 console.log(JSON.stringify({path,status:r.status,type:r.headers.get('content-type'),redirectHost:r.headers.get('location')?new URL(r.headers.get('location'),base).hostname:null,body:r.status===200?(await r.text()).slice(0,120):undefined}));
}
