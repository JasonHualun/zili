const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function setup(voices, text = 'Hello') {
 const calls=[], messages=[];
 const context={speechSynthesis:{getVoices:()=>voices,cancel(){},speak:u=>calls.push(u)},SpeechSynthesisUtterance:function(text){this.text=text;}};
 vm.runInNewContext(fs.readFileSync(__dirname+'/english-voice.js','utf8'),context);
 return {calls,messages,api:context.ZiliEnglishVoice.attach(null,()=> text,s=>messages.push(s))};
}
test('only Google US English is used regardless of list order',async()=>{
 const google={name:'Google US English',lang:'en-US'};
 const x=setup([{name:'Zarvox',lang:'en-US'},google]);
 await x.api.toggle();assert.equal(x.calls[0].voice,google);
 await x.api.toggle();assert.equal(x.calls.length,1);
});
test('unavailable fixed voice does not fall back or play',async()=>{
 const x=setup([{name:'Zarvox',lang:'en-US'}]);await x.api.toggle();
 assert.equal(x.calls.length,0);assert.match(x.messages[0],/暂不可用/);
});
test('old completion cannot reset current playback',async()=>{
 const x=setup([{name:'Google US English',lang:'en-US'}]);
 await x.api.toggle();x.api.stop();await x.api.toggle();x.calls[0].onend();
 await x.api.toggle();assert.equal(x.calls.length,2);
});
test('read selection then example; stop cancels the remaining queue',async()=>{
 const voice={name:'Google US English',lang:'en-US'};
 const x=setup([voice],['Vibe coder','He builds apps.']);await x.api.toggle();
 assert.equal(x.calls[0].text,'Vibe coder');x.calls[0].onend();
 assert.equal(x.calls[1].text,'He builds apps.');
 const y=setup([voice],['Vibe coder','He builds apps.']);await y.api.toggle();y.api.stop();y.calls[0].onend();assert.equal(y.calls.length,1);
});
