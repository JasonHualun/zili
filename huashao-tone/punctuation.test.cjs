const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const read=f=>fs.readFileSync(__dirname+'/'+f,'utf8');
test('noPeriods survives normalization and preserves decimals and ellipsis',()=>{
 const c={};vm.runInNewContext(read('optimizer.js'),c);const o=c.ToneOptimizer;
 assert.equal(o.normalizeSettings({punctuation:'noPeriods'}).punctuation,'noPeriods');
 const input='好。 Yes. 3.14 ... .... https://a.com';
 assert.equal(o.applyPunctuation(input,{punctuation:'noPeriods'},'comment'),'好  Yes  3.14 ... .... https://a.com');
 assert.equal(o.applyPunctuation(input,{punctuation:'noPeriods'},'translate'),input);
});
test('chat request returns confirmation proposal without invoking model',async()=>{
 const c={};vm.runInNewContext(read('learning-service.js'),c);
 const r=await c.ZiliLearning.handle({type:'ZILI_ASSIST',action:'chat',text:'以后不要加句号，夸张用3个感叹号'}, {readSettings:async()=>({reference:'原有资料'}),readModelEngine:()=>{throw Error('unexpected model call');}});
 assert.equal(r.proposal.punctuation,'noPeriods');assert.match(r.proposal.reference,/原有资料/);assert.match(r.proposal.reference,/3个感叹号/);assert.match(r.text,/不加句号/);
});
