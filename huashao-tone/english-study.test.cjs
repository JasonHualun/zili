const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const read=f=>fs.readFileSync(__dirname+'/'+f,'utf8');
test('word sentence paragraph use distinct study headings and omit absent sections',()=>{
 const c={};vm.runInNewContext(read('english-study.js'),c);
 for(const [kind,label] of [['word','词语学习'],['sentence','句子精读'],['paragraph','段落精读']]){
 const rows=c.ZiliEnglishStudy.blocks({study:{kind,partOfSpeech:'形容词',expressions:[],breakdown:[]}},'source');
 assert.equal(rows[0].label,label);assert.equal(rows.some(r=>r.label==='词性'),kind==='word');assert.equal(rows.some(r=>r.label==='句子拆解'),false);
 }
});
test('structured learning response accepts fenced JSON, bounds lists and retains speech fields',async()=>{
 const data={translation:'完整译文',kind:'paragraph',expressions:Array.from({length:8},()=>({text:'figure out',meaning:'弄明白'})),breakdown:[null,{text:2}],example:'I figured it out.',exampleTranslation:'我弄明白了。'};
 const c={ZiliModelClient:{converse:async()=>({text:'```json\n'+JSON.stringify(data)+'\n```'})}};
 vm.runInNewContext(read('learning-service.js'),c);
 const r=await c.ZiliLearning.handle({type:'ZILI_ASSIST',action:'english',text:'Selected English'},{readSettings:async()=>({}),readModelEngine:async()=>({provider:'mock',apiKeys:{mock:'test-only'},models:{mock:'mock'}})});
 assert.equal(r.ok,true);assert.equal(r.study.kind,'paragraph');assert.equal(r.study.expressions.length,3);assert.equal(r.study.breakdown.length,0);assert.equal(r.example,'I figured it out.');assert.equal(r.text,'完整译文');
});
