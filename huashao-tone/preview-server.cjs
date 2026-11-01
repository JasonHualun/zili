// Local-only UI harness. No credentials or real model requests. Not an extension entrypoint.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const shim = `
const db={};const listeners=[];
const storage={get:async keys=> typeof keys==='string'?{[keys]:db[keys]}:Object.fromEntries((Array.isArray(keys)?keys:Object.keys(keys||{})).map(k=>[k,db[k]])),set:async value=>{Object.assign(db,value);listeners.forEach(fn=>fn(Object.fromEntries(Object.entries(value).map(([k,v])=>[k,{newValue:v}])),'local'));},remove:async k=>{delete db[k];}};
window.chrome={storage:{local:storage,sync:storage,onChanged:{addListener:fn=>listeners.push(fn)}},runtime:{id:'preview',getURL:p=>'/'+p,onMessage:{addListener(fn){(window.__ziliMsg=window.__ziliMsg||[]).push(fn);}},sendMessage:(m,cb)=>{const p=dispatch(m);p.then(cb);return p;}},tabs:{query:async()=>[],sendMessage:async()=>({ok:true})},permissions:{request:async()=>false}};
let cfg={};
async function dispatch(m){
if(m.type==='GET_SETTINGS')return {ok:true,settings:ToneOptimizer.normalizeSettings(cfg)};
if(m.type==='SAVE_SETTINGS'){cfg=ToneOptimizer.normalizeSettings(m.settings);return {ok:true,settings:cfg};}
if(m.type==='GET_TRIGGER_REPLIES')return {ok:true,triggerReplies:{enabled:false,rules:[]}};
if(m.type==='OPTIMIZE')return {ok:true,ready:true,mode:m.mode,output:'这可以 我也试试看',confidence:.9};
if(m.type==='GET_ENGINE_STATUS'||m.type==='TEST_MODEL_CONNECTION')return {ok:true,status:'ready',keyConfigured:true,provider:'qwen',providerLabel:'模拟接口',providers:[],models:[],model:'mock'};
if(m.type==='ZILI_ASSIST'&&/回复/.test(m.text||''))return {ok:true,text:'看了「'+(m.page&&m.page.title||'')+'」，写了一条：',draft:'这个对比做得很实在，Dots 那段终于有人讲清楚了'};
if(m.type==='ZILI_ASSIST')return {ok:true,text:m.action==='trial'?'这可以 我也试试看':m.action==='english'?'含义：弄明白。用法：figure out a problem。例句：I figured it out. 我弄明白了。':'可以把回复调短一点，确认后再应用。',proposal:m.action==='chat'?{length:10}:null,usage:{inputTokens:0,outputTokens:0}};
if(m.type==='ANALYZE_SCREENSHOT')return {ok:true,mode:'comment',intent:'回复截图里这个吹泡泡的玩偶',confidence:.92,output:'这花花笑得也太治愈了，泡泡配它刚刚好',usage:{input:820,output:40},cost:{amount:.0004,currency:'USD'}};
if(m.type==='ZILI_COLLECT_DETECT'&&window.__bridgeDown)return {ok:false,error:'字里桥没有响应，请重新加载插件后再试（Native host has exited.）'};if(m.type==='ZILI_COLLECT_DETECT')return {ok:true,agents:[{id:'hermes',label:'Hermes',allowed:true},{id:'codex',label:'Codex',allowed:true}],found:[],selected:'hermes',folder:'~/Documents/字里收纳',folderOk:true};if(m.type==='ZILI_COLLECT_SUBMIT'){const j={id:'j'+Date.now(),title:(m.items[0].title||'')+(m.items.length>1?' 等 '+m.items.length+' 条':''),agent:'Hermes',intent:m.intent,status:'running',createdAt:Date.now()};(window.__jobs=window.__jobs||[]).unshift(j);setTimeout(()=>{j.status='done';j.result=m.intent==='topic'?'已拒收':'已保存';j.receipt=j.result==='已拒收'?'状态：已拒收\\n'+j.title+' → 未保存：内容是广告，跟做选题对不上':'状态：已保存\\n'+j.title+' → Wiki wiki/AI与Agent/xxx.md（NAV-AGENT）';},6000);window.__lastSubmit=m;return {ok:true,job:j};}if(m.type==='ZILI_COLLECT_STATUS')return {ok:true,jobs:window.__jobs||[]};if(m.type==='CAPTURE_VISIBLE_TAB'){const c=document.createElement('canvas');c.width=800;c.height=500;const x=c.getContext('2d');x.fillStyle='#cde';x.fillRect(0,0,800,500);return {ok:true,dataUrl:c.toDataURL('image/png')};}if(m.type==='ZILI_PAGE_FILTER')return {ok:true,hide:m.items.filter(x=>!/\\bAI\\b|人工智能|大模型/.test(x.t)).map(x=>x.i)};
if(m.type.startsWith('ZILI_'))return ZiliLearning.handle(m,{});
return {ok:true};
}
window.addEventListener('error',e=>{(window.previewErrors||=[]).push(e.message)});
window.addEventListener('unhandledrejection',e=>{(window.previewErrors||=[]).push(String(e.reason))});
`;
http.createServer((req,res)=>{
 const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1)||'popup.html';
 if(name==='preview-shim.js'){res.setHeader('Content-Type','text/javascript');return res.end(shim);}
 if(name==='feed.html'){
   const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'manifest.json'),'utf8'));
   const titles=['AI 写代码实测','泰国旅行 Thailand vlog','明星八卦合集','大模型推理加速','He said goodbye','说唱合集 2026','人工智能入门','email 营销技巧'];
   const card=(t,i)=>'<li class="card" style="height:60px;margin:6px;border:1px solid #ccc;list-style:none"><a href="#'+i+'">'+t+'</a><span class="meta">作者'+i+'</span></li>';
   const feed=titles.map(card).join('')+'<li class="card" style="height:60px;margin:6px;border:1px solid #ccc;list-style:none"><a href="#ad">买一送一 限时</a><span>广告</span></li>';
   res.setHeader('Content-Type','text/html');return res.end('<!doctype html><html><head><meta charset="utf-8"><title>信息流测试</title><script src="preview-shim.js"></script><script src="learning-service.js"></script>'+manifest.content_scripts.filter(c=>c.run_at==='document_start').flatMap(c=>c.js).map(f=>'<script src="'+f+'"></script>').join('')+(/hostile/.test(req.url)?'<script>for(const t of ["keydown","keypress"]){window.addEventListener(t,e=>{e.stopImmediatePropagation();window.__swallowed=(window.__swallowed||0)+1;},true);document.addEventListener(t,e=>e.stopPropagation(),true);}</script>':'')+'</head><body><ul style="padding:0;width:320px">'+feed+'</ul>'+manifest.content_scripts[0].js.map(f=>'<script src="'+f+'"></script>').join('')+'</body></html>');
 }
 if(name==='page.html'){
   const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'manifest.json'),'utf8'));
   res.setHeader('Content-Type','text/html');return res.end('<!doctype html><html><head><meta charset="utf-8"><title>字里隔离测试</title><script src="preview-shim.js"></script><script src="learning-service.js"></script></head><body><h1>隔离测试：不调用真实模型</h1><article><p id="reading">I finally figured out how this tool works.</p></article><textarea id="composer" aria-label="测试输入框" rows="6" cols="60"></textarea>'+manifest.content_scripts[0].js.map(f=>'<script src="'+f+'"></script>').join('')+'</body></html>');
 }
 const file=path.resolve(__dirname,name);
 if(!file.startsWith(__dirname+path.sep)||!['.js','.css','.html','.png','.svg'].includes(path.extname(file))){res.writeHead(404);return res.end();}
 try{let data=fs.readFileSync(file);if(name==='popup.html')data=data.toString().replace('<head>','<head><script src="/preview-shim.js"></script><script src="/learning-service.js"></script>');
 res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'})[path.extname(file)]);res.end(data);
 }catch{res.writeHead(404);res.end();}
}).listen(18779,'127.0.0.1',()=>console.log('Isolated preview http://127.0.0.1:18779'));
