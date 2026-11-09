const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { createApp } = require('../server');
const { createRedisStore, storeFromEnv } = require('../redis-store');

test('serverless instances share sessions, real history, online state and logout via Redis REST', async t => {
  // HTTP Redis fixture exercises the actual REST adapter without live credentials.
  const strings = new Map(), sets = new Map(), commands = [];
  let time = Date.parse('2026-11-10T06:00:00Z');
  const redis = http.createServer(async (req, res) => {
    assert.equal(req.headers.authorization, 'Bearer test-write-token');
    let raw=''; for await (const chunk of req) raw+=chunk;
    const args=JSON.parse(raw); commands.push(args);
    const [op,key,...params]=args;
    let result;
    if (op==='GET') result=strings.get(key) ?? null;
    else if(op==='SET') { strings.set(key,params[0]); result='OK'; }
    else if(op==='DEL') result=Number(strings.delete(key));
    else if(op==='ZADD') { if(!sets.has(key))sets.set(key,new Map());sets.get(key).set(params[1],params[0]);result=1; }
    else if(op==='ZREM') result=Number(sets.get(key)?.delete(params[0]));
    else if(op==='ZRANGEBYSCORE') result=[...(sets.get(key)||[])].filter(([,score])=>score>=params[0] && score<=params[1]).map(([member])=>member);
    else if(op==='EVAL') {
      const actualKey=args[3];
      if(key.includes('ZCARD')) { const set=sets.get(actualKey)||new Map();for(const [member,score] of set)if(score<=args[4])set.delete(member);result=set.size; }
      else { result=Number(strings.get(actualKey)||0)+1;strings.set(actualKey,result); }
    } else { res.writeHead(400);return res.end(JSON.stringify({error:'Unsupported command'})); }
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({result}));
  });
  await new Promise(r=>redis.listen(0,'127.0.0.1',r));
  const dataDir=path.join(os.tmpdir(),'vo-unused-'+Date.now());
  const makeStore=()=>createRedisStore({url:`http://127.0.0.1:${redis.address().port}`,token:'test-write-token',prefix:'vo:test'});
  const first=createApp({store:makeStore(),serverless:true,now:()=>time,dataDir});
  const second=createApp({store:makeStore(),serverless:true,now:()=>time,dataDir});
  await Promise.all([first,second].map(server=>new Promise(r=>server.listen(0,'127.0.0.1',r))));
  t.after(async()=>{for(const server of [first,second,redis]){server.closeAllConnections();await new Promise(r=>server.close(r));}});
  const call=(server,route,options)=>fetch(`http://127.0.0.1:${server.address().port}`+route,options);
  const post=(server,route,data,headers={})=>call(server,route,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(data)});
  assert.equal(fs.existsSync(dataDir),false);
  assert.equal((await(await call(first,'/api/config')).json()).transport,'polling');
  const login=await post(first,'/api/login',{username:'admin',password:'VoPaper@2026'});
  assert.equal(login.status,200); const headers={Cookie:login.headers.get('set-cookie').split(';')[0]};
  assert.equal((await call(second,'/admin',{headers})).status,200);
  const event={type:'pageview',visitor:'visitor-1234567890',session:'session-1234567890',path:'/'};
  assert.equal((await post(first,'/api/track',event)).status,200);
  await post(second,'/api/track',{...event,path:'/#studio'});
  await post(second,'/api/track',{...event,type:'heartbeat'});
  const query='/api/stats?start=2026-11-10&end=2026-11-10';
  const stats=await(await call(second,query,{headers})).json();
  assert.deepEqual(stats.totals,{pageviews:2,users:1,visits:1});assert.equal(stats.online,1);
  assert.equal((await call(first,'/api/stream',{headers})).status,409);
  time+=66000;assert.equal((await(await call(first,query,{headers})).json()).online,0);
  await post(second,'/api/logout',{},headers);
  assert.equal((await call(first,query,{headers})).status,401);
  assert.equal(commands.find(c=>c[0]==='SET')[4],28800);
  assert.equal(fs.existsSync(dataDir),false);
});

test('missing Vercel storage fails clearly without local disk fallback', async t=>{
  const store=storeFromEnv({VERCEL:'1'});
  const server=createApp({store,serverless:true});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));});
  const base=`http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(base+'/admin',{redirect:'manual'})).status,302);
  assert.equal((await fetch(base+'/admin/login')).status,200);
  const response=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:'VoPaper@2026'})});
  assert.equal(response.status,503);assert.match((await response.json()).error,/Redis/);
  assert.equal((await fetch(base+'/api/stats')).status,401);
});

test('static build never exposes protected HTML or backend files',()=>{
  const { execFileSync }=require('node:child_process');
  const root=path.join(__dirname,'../public');
  fs.mkdirSync(path.join(root,'admin'),{recursive:true});
  fs.writeFileSync(path.join(root,'admin/dashboard.html'),'stale private artifact');
  execFileSync(process.execPath,[path.join(__dirname,'../scripts/build-vercel.js')]);
  for(const file of ['admin/dashboard.html','admin/login.html','server.js','.env','README.md','redis-store.js'])assert.equal(fs.existsSync(path.join(root,file)),false);
  for(const file of ['index.html','tracker.js','admin/dashboard.js','admin/styles.css','assets/game/flappy-vo-skins.png'])assert.equal(fs.existsSync(path.join(root,file)),true);
});
