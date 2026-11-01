(function (global) {
  function attach(root, api) {
    const panel = document.createElement("div");
    panel.className = "zili-learning-panel";
    panel.style.cssText = "margin:8px 12px;font-size:12px;line-height:1.5";
    panel.innerHTML = `<summary>学习与我的表达</summary><div style="display:grid;gap:6px;padding-top:8px">
      <button type="button" data-action="remember">记住我的表达</button>
      <div data-editor hidden><label>使用场景<textarea data-context maxlength="800" rows="2"></textarea></label><label>这句话你会怎么说？<textarea data-text maxlength="2000" rows="3"></textarea></label><button type="button" data-action="save-expression">确认保存到我的口吻</button></div>
      <details data-lesson hidden><summary><strong>学一点</strong><small>查看用法和例句</small></summary><div data-lesson-text></div></details>
      <div data-english hidden><button type="button" data-action="speak">朗读</button><button type="button" data-action="save-word">收藏</button></div>
      <span data-status role="status"></span></div>`;
    root.querySelector(".zili-footer").after(panel);
    const style = document.createElement("style");
    style.textContent = `.zili-card[data-mode="status"] .zili-learning-panel,.zili-card[data-mode="manual"] .zili-learning-panel{display:none}.zili-learning-panel textarea{box-sizing:border-box;display:block;width:100%;resize:vertical;border:1px solid #cdd5df;border-radius:8px;padding:8px;font:inherit}.zili-learning-panel button{font:inherit;padding:5px 9px;border:1px solid #cdd5df;border-radius:8px;background:white;color:#426b91;cursor:pointer}`;
    root.append(style);
    const entryStyle=document.createElement('style');
    entryStyle.textContent='.zili-learning-panel [data-lesson]>summary{display:flex;align-items:center;gap:8px;min-height:44px;box-sizing:border-box;padding:10px 12px;border-radius:8px;background:var(--zili-accent-soft);color:var(--zili-accent-strong);font-size:14px;list-style:none;cursor:pointer}.zili-learning-panel [data-lesson]>summary small{flex:1;font-size:11px;line-height:1.4;font-weight:400}.zili-learning-panel [data-lesson]>summary::after{content:"⌄";font-size:18px}.zili-learning-panel [data-lesson][open]>summary::after{content:"⌃"}.zili-learning-panel [data-lesson]>summary::-webkit-details-marker{display:none}.zili-learning-panel [data-lesson]>summary:focus-visible{outline:2px solid var(--zili-accent-strong);outline-offset:2px}';
    root.append(entryStyle);
    const studyStyle=document.createElement('style');
    studyStyle.textContent='.zili-learning-panel [data-lesson-text] section{padding:10px 0;border-bottom:1px solid rgba(80,90,100,.12)}.zili-learning-panel [data-lesson-text] h4{margin:0 0 5px;font-size:11px;font-weight:600;color:var(--zili-accent-strong)}.zili-learning-panel [data-lesson-text] p{margin:0;white-space:pre-wrap;font-size:13px;line-height:1.65}.zili-learning-panel [data-lesson-text] section:first-child p{font-size:16px;font-weight:600}.zili-learning-panel [data-lesson-text] section:last-child p{color:#62717b;font-size:12px}';
    root.append(studyStyle);
    const status = message => { panel.querySelector("[data-status]").textContent = message; };
    const request = async message => { const result = await api.send(message); if (!result?.ok) throw new Error(result?.error || "操作失败，请重试"); return result; };
    let current = null;
    const voice=global.ZiliEnglishVoice.attach(panel,()=>[current?.context||'',current?.example||''],status);
    voice.setState(playing=>{panel.querySelector('[data-action="speak"]').textContent=playing?'停止':'朗读';});
    const hideStyle=document.createElement('style');hideStyle.textContent='.zili-learning-panel [hidden]{display:none!important}.zili-learning-panel[data-english-mode="true"]>summary{display:none}';root.append(hideStyle);
    panel.addEventListener("click", async event => {
      const action = event.target.dataset.action;
      if (!action) return;
      try {
        if (action === "stop") { global.speechSynthesis?.cancel(); return; }
        if (!current) return status("请先生成一条结果");
        if (action === "remember") {
          panel.querySelector("[data-editor]").hidden = false;
          panel.querySelector("[data-context]").value = current.context;
          panel.querySelector("[data-text]").value = current.output;
        } else if (action === "save-expression") {
          await request({ type: "ZILI_PROFILE_SAVE", context: panel.querySelector("[data-context]").value, text: panel.querySelector("[data-text]").value });
          status("已记住，可在设置中的口吻档案查看或删除"); panel.querySelector("[data-editor]").hidden = true;
        } else if (action === "save-word") {
          await request({ type: "ZILI_ENGLISH_SAVE", context: current.context, text: [current.output,current.lesson,current.example,current.exampleTranslation].filter(Boolean).join('\n'), example: current.example, exampleTranslation: current.exampleTranslation, source: location.href }); status("已加入英语收藏");
        } else if (action === "speak") {
          await voice.toggle();
        }
      } catch (e) { status(e.message); }
    });
    return { stop: voice.stop, render(result, context) {
      voice.stop();
      current = result ? { output: result.output, lesson: result.lesson, example: result.example, exampleTranslation: result.exampleTranslation, context: String(context || "").slice(0, 1200) } : null;
      const english=result?.mode==='english';
      const lessonBox = panel.querySelector('[data-lesson]');
      lessonBox.hidden = !english || !(result?.lesson || result?.example || result?.study?.expressions?.length || result?.study?.breakdown?.length || result?.study?.usage || result?.study?.formation);
      lessonBox.open = false;
      if(global.ZiliEnglishStudy) global.ZiliEnglishStudy.render(panel.querySelector('[data-lesson-text]'),result,context);
      if(current && global.ZiliEnglishStudy) current.lesson = global.ZiliEnglishStudy.blocks({...result,example:'',exampleTranslation:''},'').map(x=>x.label+'：'+x.text).join('\n');
      panel.hidden = !result || (!english && !['comment','rewrite','complete'].includes(result.mode));
      panel.dataset.englishMode=String(english);
      
      panel.querySelector('summary').textContent='保存我的表达';
      panel.querySelector('summary').hidden = true;
      panel.querySelector('[data-action="remember"]').hidden=english;
      panel.querySelector("[data-english]").hidden = result?.mode !== "english";
      panel.querySelector("[data-editor]").hidden = true;
      status("");
    } };
  }
  global.ZiliLearningCard = { attach };
})(globalThis);
