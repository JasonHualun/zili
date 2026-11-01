const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const read=f=>fs.readFileSync(__dirname+'/'+f,'utf8');
test('translation prompt excludes surrounding page material',()=>{
 const c={};vm.runInNewContext(read('deepseek-client.js'),c);
 const p=c.ZiliModelClient.buildUserMessage({mode:'translate',selectedText:'Computer Use',pageContext:'UNRELATED_PAGE_METRICS',settings:{}});
 assert.match(p,/Computer Use/);assert.doesNotMatch(p,/UNRELATED_PAGE_METRICS/);
});
test('English controls remain visible across mode changes without a details disclosure',()=>{
 const nodes=new Map();const el=()=>({dataset:{},style:{},hidden:false,append(){},after(n){this.next=n;},addEventListener(){},querySelector(s){if(!nodes.has(s))nodes.set(s,el());return nodes.get(s);}});
 const root=el();let panel;
 const c={document:{createElement(tag){const n=el();if(tag==='div'&&!panel)panel=n;return n;}},ZiliEnglishVoice:{attach:()=>({stop(){},setState(){}})}};
 vm.runInNewContext(read('content-learning.js'),c);
 const card=c.ZiliLearningCard.attach(root,{send(){}});
 for(const mode of ['english','explain','comment','english']){
 card.render({mode,output:'test'},'Computer Use');
 assert.equal(nodes.get('[data-english]').hidden,mode!=='english');
 if(mode==='english'){assert.equal(panel.hidden,false);assert.equal(nodes.get('[data-action="remember"]').hidden,true);}
 }
 assert.equal(nodes.get('.zili-footer').next,panel);
});
test('manual switch retains original text and cancels delayed automatic selection',()=>{
 const source=read('content.js');
 const fn=source.slice(source.indexOf('  function switchSelectionMode('),source.indexOf('  function verifySelection('));
 const state={selectionInfo:{text:'Computer Use',mode:'translate'},settings:{enabled:true,selectionComments:true},requestId:0};
 const requests=[];
 const c={state,clearTimeout(){},ZiliSelection:{looksLikeQuestion:t=>t.endsWith('?'),shouldUseWebSearch:()=>false},ZiliFeatureGates:{allowsSelectionMode:()=>true},showStatus(){},send:m=>{requests.push(m);return new Promise(()=>{});},document:{title:'page'},articleContext:a=>String(a?.innerText||''),optimizeComment(){requests.push({text:state.selectionInfo.text,mode:state.selectionInfo.mode});}};
 vm.runInNewContext(fn+';switchSelectionMode("english");switchSelectionMode("comment");switchSelectionMode("explain");',c);
 assert.match(requests[0].text,/所选内容：Computer Use/);assert.equal(requests[1].text,'Computer Use');assert.equal(requests[2].mode,'explain');
 assert.equal(state.selectionInfo.text,'Computer Use');
});
test('page context drops platform translation buttons so replies never review the translation',()=>{
 const source=read('content.js');
 const block=source.slice(source.indexOf('  const TRANSLATION_UI'),source.indexOf('  function writeDraftToPage('));
 const c={};vm.runInNewContext(block+';globalThis.out=articleContext({innerText:"Boris Cherny\\n翻译自 英语 显示原文\\n五种原型\\n评价此翻译：\\nShow original"});',c);
 assert.equal(c.out,'Boris Cherny\n五种原型');
 const m={};vm.runInNewContext(read('deepseek-client.js'),m);
 assert.match(String(m.ZiliModelClient.buildPrompt({mode:'comment',selectedText:'x',settings:{}})),/不评价翻译/);
});
test('Enter that confirms an IME candidate is not treated as send',()=>{
 const listeners={};const g={addEventListener:(t,f)=>{(listeners[t]=listeners[t]||[]).push(f);}};g.globalThis=g;
 vm.runInNewContext(read('key-guard.js').replace('typeof globalThis !== "undefined" ? globalThis : window','globalThis'),g);
 const ime=g.ZiliKeyGuard.isImeKey;
 assert.equal(ime({key:'Enter',isComposing:true}),true);
 assert.equal(ime({key:'Enter',keyCode:229}),true);
 listeners.compositionstart[0]();listeners.compositionend[0]();
 assert.equal(ime({key:'Enter',isComposing:false,keyCode:13}),true);
 return new Promise(r=>setTimeout(()=>{assert.equal(ime({key:'Enter',isComposing:false,keyCode:13}),false);r();},150));
});
