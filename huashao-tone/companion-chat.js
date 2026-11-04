(function (global) {
  const KEY = 'ziliAssistantChatV1';
  const PAGE_FILTER_KEY = 'ziliPageFilterRule';
  const DEFAULT_PAGE_FILTER = '只留 AI 相关';
  const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
  const ACCEPTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
  function welcome(settings) {
    return String(settings?.reference || '').trim()
      ? '想聊点什么？我可以帮你调整表达，或者陪你想想怎么写。'
      : '想聊点什么？可以先建立自己的口吻，也可以让我陪你想想怎么写。';
  }
  // What the user is looking at, so "reply to this video" works without pasting the title.
  function pageSnapshot() {
    const pick = (selector, max) => {
      const el = document.querySelector(selector);
      return String(el?.content || el?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, max);
    };
    const video = [...document.querySelectorAll('video')].find(v => v.offsetWidth > 200);
    // The post itself on social sites: X status page, 小红书 note, 抖音 video, YouTube description.
    const post = pick('article [data-testid="tweetText"], #detail-title, [data-e2e="video-desc"], [data-e2e="detail-video-info"] h1', 1500);
    const main = document.querySelector('main, article, [role=main]') || document.body;
    const text = String(main?.innerText || '').replace(/\s+/g, ' ').trim();
    return {
      url: location.href.slice(0, 300),
      title: (pick('h1.ytd-watch-metadata, h1', 200) || document.title).slice(0, 200),
      author: pick('article [data-testid="User-Name"], #owner #channel-name, ytd-video-owner-renderer #channel-name, [itemprop=author] [itemprop=name], .author-wrapper .username', 80),
      description: pick('#description-inline-expander, ytd-text-inline-expander, #detail-desc, meta[name=description], meta[property="og:description"]', 800),
      post,
      selection: String(getSelection?.() || '').trim().slice(0, 1000),
      video: video ? `正在播放视频，进度 ${Math.round(video.currentTime)} 秒 / 共 ${Math.round(video.duration || 0)} 秒` : '',
      text: text.slice(0, 1500)
    };
  }
  function attach(root, api) {
    const panel = document.createElement('section');
    panel.className = 'companion-chat'; panel.hidden = true;
    panel.setAttribute('aria-label', '卡路里对话');
    // Icons: Remix Icon v4.6.0 (Apache-2.0) paths, inlined because page shadow roots cannot reference the extension sprite.
    panel.innerHTML = `<header><nav data-views><button type="button" data-view="chat" aria-pressed="true">对话</button><button type="button" data-view="tools" aria-pressed="false">功能</button><button type="button" data-view="collect" aria-pressed="false">收纳</button><button type="button" data-view="result" aria-pressed="false" hidden>当前结果</button></nav><button data-close class="icon" type="button" aria-label="收起对话"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11.9997 10.5865L16.9495 5.63672L18.3637 7.05093L13.4139 12.0007L18.3637 16.9504L16.9495 18.3646L11.9997 13.4149L7.04996 18.3646L5.63574 16.9504L10.5855 12.0007L5.63574 7.05093L7.04996 5.63672L11.9997 10.5865Z"/></svg></button></header><div data-tools><button type="button" data-tool="filter" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 18H14V16H10V18ZM3 6V8H21V6H3ZM6 13H18V11H6V13Z"/></svg><span>一键脱水</span></button><button type="button" data-tool="copy" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.9998 6V3C6.9998 2.44772 7.44752 2 7.9998 2H19.9998C20.5521 2 20.9998 2.44772 20.9998 3V17C20.9998 17.5523 20.5521 18 19.9998 18H16.9998V20.9991C16.9998 21.5519 16.5499 22 15.993 22H4.00666C3.45059 22 3 21.5554 3 20.9991L3.0026 7.00087C3.0027 6.44811 3.45264 6 4.00942 6H6.9998ZM5.00242 8L5.00019 20H14.9998V8H5.00242ZM8.9998 6H16.9998V16H18.9998V4H8.9998V6Z"/></svg><span>本页复制</span></button><button type="button" data-tool="subtitles" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 3C21.5523 3 22 3.44772 22 4V20C22 20.5523 21.5523 21 21 21H3C2.44772 21 2 20.5523 2 20V4C2 3.44772 2.44772 3 3 3H21ZM20 5H4V19H20V5ZM9 8C10.1045 8 11.1049 8.44841 11.829 9.173L10.4153 10.5866C10.0534 10.2241 9.55299 10 9 10C7.895 10 7 10.895 7 12C7 13.105 7.895 14 9 14C9.5525 14 10.0525 13.7762 10.4144 13.4144L11.828 14.828C11.104 15.552 10.104 16 9 16C6.792 16 5 14.208 5 12C5 9.792 6.792 8 9 8ZM16 8C17.1045 8 18.1049 8.44841 18.829 9.173L17.4153 10.5866C17.0534 10.2241 16.553 10 16 10C14.895 10 14 10.895 14 12C14 13.105 14.895 14 16 14C16.5525 14 17.0525 13.7762 17.4144 13.4144L18.828 14.828C18.104 15.552 17.104 16 16 16C13.792 16 12 14.208 12 12C12 9.792 13.792 8 16 8Z"/></svg><span>字幕翻译</span></button><button type="button" data-tool="capture" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3H5V5H3V3ZM7 3H9V5H7V3ZM11 3H13V5H11V3ZM15 3H17V5H15V3ZM19 3H21V5H19V3ZM19 7H21V9H19V7ZM3 19H5V21H3V19ZM3 15H5V17H3V15ZM3 11H5V13H3V11ZM3 7H5V9H3V7ZM10.6667 11L11.7031 9.4453C11.8886 9.1671 12.2008 9 12.5352 9H15.4648C15.7992 9 16.1114 9.1671 16.2969 9.4453L17.3333 11H20C20.5523 11 21 11.4477 21 12V20C21 20.5523 20.5523 21 20 21H8C7.44772 21 7 20.5523 7 20V12C7 11.4477 7.44772 11 8 11H10.6667ZM9 19H19V13H16.263L14.9296 11H13.0704L11.737 13H9V19ZM14 18C12.8954 18 12 17.1046 12 16C12 14.8954 12.8954 14 14 14C15.1046 14 16 14.8954 16 16C16 17.1046 15.1046 18 14 18Z"/></svg><span>框选识别</span></button><button type="button" data-tool="tutor" aria-pressed="false" title="打开英语口语陪练小窗，直接开口练"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a3 3 0 0 0-3 3v4a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Zm0-2a5 5 0 0 1 5 5v4a5 5 0 0 1-10 0V6a5 5 0 0 1 5-5ZM3.055 11H5.07a7 7 0 0 0 13.858 0h2.016A9.004 9.004 0 0 1 13 18.945V23h-2v-4.055A9.004 9.004 0 0 1 3.055 11Z"/></svg><span>英语陪练</span></button></div><div data-messages aria-live="polite"></div><div data-proposal></div><div data-shortcuts></div><form><input data-image-input type="file" accept="image/png,image/jpeg,image/webp" hidden><div data-image-preview hidden><img alt="待发送图片预览"><span data-image-name></span><button data-remove-image type="button" aria-label="移除图片">移除</button></div><div data-compose><textarea maxlength="2000" rows="1" placeholder="有什么想聊的？"></textarea><button data-add-image class="icon" type="button" aria-label="选择图片"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.9918 21C2.44405 21 2 20.5551 2 20.0066V3.9934C2 3.44476 2.45531 3 2.9918 3H21.0082C21.556 3 22 3.44495 22 3.9934V20.0066C22 20.5552 21.5447 21 21.0082 21H2.9918ZM20 15V5H4V19L14 9L20 15ZM20 17.8284L14 11.8284L6.82843 19H20V17.8284ZM8 11C6.89543 11 6 10.1046 6 9C6 7.89543 6.89543 7 8 7C9.10457 7 10 7.89543 10 9C10 10.1046 9.10457 11 8 11Z"/></svg></button><button class="icon send" type="submit" aria-label="发送"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 1.34558C3.58425 1.34558 3.66714 1.36687 3.74096 1.40747L22.2034 11.5618C22.4454 11.6949 22.5337 11.9989 22.4006 12.2409C22.3549 12.324 22.2865 12.3924 22.2034 12.4381L3.74096 22.5924C3.499 22.7255 3.19497 22.6372 3.06189 22.3953C3.02129 22.3214 3 22.2386 3 22.1543V1.84558C3 1.56944 3.22386 1.34558 3.5 1.34558ZM5 4.38249V10.9999H10V12.9999H5V19.6174L18.8499 11.9999L5 4.38249Z"/></svg></button></div></form><small data-status role="status"></small>`;
    const css = document.createElement('style');
    css.textContent = `.companion-chat{position:fixed;display:grid;gap:10px;width:min(330px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:auto;padding:12px;border:1px solid color-mix(in srgb,var(--zili-accent,#557fa8) 16%,transparent);border-radius:18px;background:var(--zili-soft,#fafafa);color:var(--zili-ink,#263848);box-shadow:0 14px 40px #0002;font:13px/1.55 -apple-system,BlinkMacSystemFont,sans-serif;pointer-events:auto;animation:zili-chat-in .2s ease}@keyframes zili-chat-in{from{opacity:0;transform:translateY(6px)}}.companion-chat[hidden]{display:none}.companion-chat header{display:flex;align-items:center;justify-content:space-between;font-size:14px}.companion-chat button{cursor:pointer;border:0;border-radius:9px;padding:5px 10px;background:#fff;color:var(--zili-accent-strong,#426b91);font:inherit;font-size:12px;transition:transform .18s cubic-bezier(.34,1.56,.64,1),background .15s}.companion-chat button:hover{transform:translateY(-1px)}.companion-chat button:disabled{opacity:.5;transform:none}.companion-chat button.icon{display:grid;place-items:center;width:30px;height:30px;padding:0;background:transparent;color:#8a96a1}.companion-chat button.icon:hover{color:var(--zili-accent-strong,#426b91);background:#0000000a}.companion-chat button.icon svg{width:18px;height:18px;fill:currentColor}.companion-chat button.send{color:#fff;background:var(--zili-accent,#557fa8)}.companion-chat button.send:hover{color:#fff;background:var(--zili-accent-strong,#426b91)}.companion-chat [data-messages]{display:flex;flex-direction:column;gap:6px;max-height:260px;overflow:auto}.companion-chat [data-messages]:empty{display:none}.companion-chat [data-messages] p{flex:none;margin:0;max-width:86%;white-space:pre-wrap;overflow-wrap:anywhere;padding:7px 10px;border-radius:12px 12px 12px 4px;background:#fff}.companion-chat [data-messages] p.me{align-self:flex-end;border-radius:12px 12px 4px 12px;color:#fff;background:var(--zili-accent,#557fa8)}.companion-chat [data-messages] p.hint{max-width:none;padding:0;color:#7d8790;background:none}.companion-chat [data-shortcuts]{display:flex;flex-wrap:wrap;gap:6px}.companion-chat [data-shortcuts]:empty,.companion-chat [data-proposal]:empty{display:none}.companion-chat [data-shortcuts] button{border:1px solid color-mix(in srgb,var(--zili-accent,#557fa8) 22%,transparent);border-radius:999px;padding:3px 11px}.companion-chat [data-compose]{display:flex;align-items:flex-end;gap:2px;padding:4px 4px 4px 10px;border:1px solid #0000001a;border-radius:14px;background:#fff}.companion-chat [data-compose]:focus-within{border-color:var(--zili-accent,#557fa8)}.companion-chat textarea{min-width:0;flex:1;max-height:120px;padding:5px 0;border:0;outline:0;background:transparent;color:inherit;font:inherit;resize:none;field-sizing:content}.companion-chat [data-image-preview]{display:flex;align-items:center;gap:7px;margin-bottom:6px;padding:6px 8px;border-radius:9px;background:#ffffffb0}.companion-chat [data-image-preview] img{width:34px;height:34px;object-fit:cover;border-radius:5px}.companion-chat [data-image-name]{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.companion-chat small{display:block;color:#8a929a;font-size:11px}.companion-chat small:empty{display:none}.companion-chat [data-proposal]{display:flex;align-items:center;gap:8px;font-size:12px}.companion-chat [data-proposal] p{flex:1;margin:0;white-space:pre-wrap;max-height:120px;overflow:auto}.companion-chat [data-views]{display:flex;gap:2px;padding:2px;border-radius:10px;background:#0000000a}.companion-chat [data-views] button{padding:3px 12px;border-radius:8px;background:transparent;color:#7d8790;font-size:12px}.companion-chat [data-views] button:hover{transform:none;color:var(--zili-ink,#263848)}.companion-chat [data-views] button[aria-pressed=true]{background:#fff;color:var(--zili-ink,#263848);font-weight:600;box-shadow:0 1px 3px #0000001a}.companion-chat [data-tools]{display:grid;grid-template-columns:repeat(5,1fr);gap:5px}.companion-chat [data-tools] button{display:grid;justify-items:center;gap:5px;padding:12px 2px 10px;border-radius:12px;color:var(--zili-ink,#263848);background:#fff;font-size:12px}.companion-chat [data-tools] button:hover{transform:translateY(-2px);box-shadow:0 6px 14px #0000001a}.companion-chat [data-tools] svg{width:21px;height:21px;fill:var(--zili-accent-strong,#426b91)}.companion-chat [data-tools] button[aria-pressed=true]{color:#fff;background:var(--zili-accent,#557fa8)}.companion-chat [data-tools] button[aria-pressed=true] svg{fill:#fff}.companion-chat[data-view=chat] [data-tools],.companion-chat[data-view=tools] [data-messages],.companion-chat[data-view=tools] [data-proposal],.companion-chat[data-view=tools] [data-shortcuts],.companion-chat[data-view=tools] form{display:none!important}.companion-chat [data-messages] .draft{flex:none;display:grid;gap:8px;max-width:92%;padding:10px 12px;border:1px solid color-mix(in srgb,var(--zili-accent,#557fa8) 25%,transparent);border-radius:12px 12px 12px 4px;background:#fff}.companion-chat [data-messages] .draft p{max-width:none;padding:0;border-radius:0;background:none;font-size:14px}.companion-chat [data-messages] .draft div{display:flex;gap:6px}.companion-chat [data-messages] .draft button{padding:5px 12px;background:color-mix(in srgb,var(--zili-accent,#557fa8) 12%,#fff)}.companion-chat [data-messages] .draft button.primary{flex:1;color:#fff;background:var(--zili-accent,#557fa8)}@media (prefers-reduced-motion:reduce){.companion-chat,.companion-chat button{animation:none;transition:none}}`;
    root.append(css,panel);
    let history = [], busy = false, revision = 0, image = null, welcomeText = '';
    const q = selector => panel.querySelector(selector);
    const hiddenStyle=document.createElement('style');hiddenStyle.textContent='.companion-chat [hidden]{display:none!important}';root.append(hiddenStyle);
    const status = text => { q('[data-status]').textContent = text; };
    // 收纳视图（collect-panel.js）挂在同一个面板里；截图时整个猫和面板先藏起来。
    const collect=global.ZiliCollectPanel?.attach(panel,{status,position:()=>position(),hideForCapture:on=>{root.host.style.visibility=on?'hidden':'';}});
    if(collect)q('[data-messages]').before(collect.element);else q('[data-view="collect"]').hidden=true;
    const request = async message => {
      // 每个请求都有上限：模型卡住时给出提示，不让发送按钮一直锁着。
      const r = await api.send(message, { timeoutMs: message.type === 'ZILI_ASSIST' ? 180_000 : 15_000 });
      if (/runtime_timeout/.test(r?.error || '')) throw Error('等太久没回应，模型这会儿可能比较慢，再发一次试试');
      if (r?.ok) return r;
      if (/vision_model_required/i.test(r?.error || '')) throw Error('当前模型不能看图，请选择带“可识图”标识的模型');
      if (/screenshot_image_invalid|vision_image_invalid/i.test(r?.error || '')) throw Error('图片太大或格式不支持，请换一张再试');
      if (/runtime_unavailable|message_port_closed|empty_response/i.test(r?.error || '')) throw Error('插件刚更新过，按 ⌘R 刷新一下这个网页就好');
      throw Error(r?.error || '操作失败，请重试');
    };
    function clearImage() {
      image = null;
      q('[data-image-input]').value = '';
      q('[data-image-preview]').hidden = true;
      q('[data-image-preview] img').removeAttribute('src');
      q('[data-image-name]').textContent = '';
    }
    function showImage(next) {
      image = next;
      q('[data-image-preview] img').src = next.dataUrl;
      q('[data-image-name]').textContent = next.name;
      q('[data-image-preview]').hidden = false;
      position();
    }
    function readImage(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('图片读取失败，请重新选择'));
        reader.readAsDataURL(file);
      });
    }
    async function selectImage(file, name = '') {
      if (!file) return;
      if (!ACCEPTED_IMAGE_TYPES.has(file.type)) throw new Error('目前支持 PNG、JPG 和 WebP 图片');
      if (file.size > MAX_IMAGE_BYTES) throw new Error('图片请控制在 6MB 以内');
      const dataUrl = await readImage(file);
      if (!/^data:image\/(?:png|jpeg|webp);base64,/i.test(dataUrl)) throw new Error('图片格式无法识别，请换一张再试');
      showImage({ dataUrl, name: name || file.name || '已粘贴图片' });
      status('图片已添加，会在你点发送时一起交给当前模型');
    }
    function render() {
      const rows=history.map(m => {
        const p=document.createElement('p'); p.className=m.role==='user'?'me':''; p.textContent=m.content;
        if(!m.draft)return p;
        const box=document.createElement('div');box.className='draft';
        const text=document.createElement('p');text.textContent=m.draft;
        const actions=document.createElement('div');
        const write=document.createElement('button');write.type='button';write.className='primary';write.textContent='写进输入框';
        write.onclick=()=>{const r=api.writeDraft?.(m.draft);status(r?.ok?'已写进输入框，发出前再看一眼':'这一页没找到输入框，先点开回复框再试，或者点复制');};
        const copy=document.createElement('button');copy.type='button';copy.textContent='复制';
        copy.onclick=()=>navigator.clipboard.writeText(m.draft).then(()=>status('已复制'),()=>status('复制失败，请手动选中文字'));
        actions.append(write,copy);box.append(text,actions);
        return m.content?[p,box]:[box];
      }).flat();
      if(!rows.length&&welcomeText){const p=document.createElement('p');p.className='hint';p.textContent=welcomeText;rows.push(p);}
      q('[data-messages]').replaceChildren(...rows);
      q('[data-messages]').scrollTop=q('[data-messages]').scrollHeight;
    }
    // 面板优先放在小猫上方；上方放不下就放下方，再不行放左右两侧，始终不盖住小猫，保证小猫随时点得到。
    function position() {
      if(panel.hidden)return;
      const r=root.host.getBoundingClientRect(),w=panel.offsetWidth,h=panel.offsetHeight,gap=8,edge=12;
      const clampX=x=>Math.max(edge,Math.min(innerWidth-w-edge,x)),clampY=y=>Math.max(edge,Math.min(innerHeight-h-edge,y));
      const spots=[
        {left:clampX(r.right-w),top:r.top-h-gap,fits:r.top-h-gap>=edge},
        {left:clampX(r.right-w),top:r.bottom+gap,fits:r.bottom+gap+h<=innerHeight-edge},
        {left:r.left-w-gap,top:clampY(r.top),fits:r.left-w-gap>=edge},
        {left:r.right+gap,top:clampY(r.top),fits:r.right+gap+w<=innerWidth-edge}
      ];
      const spot=spots.find(s=>s.fits)||spots[0];
      panel.style.left=`${clampX(spot.left)}px`;
      panel.style.top=`${clampY(spot.top)}px`;
    }
    function close() { panel.hidden=true; }
    // Quick chips: dehydrate with the instruction saved in the popup's settings, plus profile setup until one exists.
    function renderShortcuts(settings) {
      const box=q('[data-shortcuts]');box.replaceChildren();
      if(String(settings?.reference||'').trim())return;
      const b=document.createElement('button');b.type='button';b.textContent='建立口吻';
      b.onclick=()=>{setView('chat');q('[data-compose] textarea').value='请一步一步引导我建立口吻，每次问一个具体场景。';q('form').requestSubmit();};box.append(b);
    }
    // Two views share one panel: chat and the four page tools. Clicking the cat flips between them.
    function setView(view) {
      panel.dataset.view=view;
      panel.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));
      if(view==='tools')renderTools();else if(view==='collect')void collect?.show();else q('[data-compose] textarea').focus();
      position();
    }
    function filterOn(){const s=globalThis.ZiliPageFilter?.status();return Boolean(s&&(s.filtered>0||s.watching));}
    function renderTools() {
      const pressed={filter:filterOn(),copy:Boolean(globalThis.ZiliPageCopy?.isActive()),subtitles:Boolean(globalThis.ZiliVideoSubtitles?.isActive())};
      panel.querySelectorAll('[data-tool]').forEach(b=>b.setAttribute('aria-pressed',String(Boolean(pressed[b.dataset.tool]))));
    }
    async function runTool(tool) {
      let action;
      if(tool==='filter'){
        if(filterOn())action={type:'restore'};
        else{const data=await chrome.storage.local.get(PAGE_FILTER_KEY).catch(()=>({}));action={type:'filter',instruction:String(data?.[PAGE_FILTER_KEY]||'').trim()||DEFAULT_PAGE_FILTER};}
      }else if(tool==='copy')action={type:'copy_mode',on:!globalThis.ZiliPageCopy?.isActive()};
      else if(tool==='subtitles')action={type:'subtitles',on:!globalThis.ZiliVideoSubtitles?.isActive()};
      else if(tool==='tutor'){const r=await api.send({type:'ZILI_VOICE_TUTOR_OPEN'});if(r?.ok)close();else status(/runtime_unavailable|message_port_closed|empty_response/.test(r?.error||'')?'插件刚更新过，按 ⌘R 刷新一下这个网页就好':(r?.error||'英语陪练没打开，请重试'));return;}
      else action={type:'capture'};
      panel.querySelectorAll('[data-tool]').forEach(b=>{b.disabled=true;});
      try{status(await runPageAction(action));}catch(e){status(e.message);}
      finally{panel.querySelectorAll('[data-tool]').forEach(b=>{b.disabled=false;});renderTools();position();}
    }
    async function open(view='chat') {
      const resultTab=q('[data-view="result"]');resultTab.hidden=!api.hasResult?.();resultTab.textContent=api.resultLabel?.()||'当前结果';
      panel.hidden=false;setView(view);
      try {
        const {settings}=await request({type:'GET_SETTINGS'});
        welcomeText=welcome(settings);
        renderShortcuts(settings);
        const data=await chrome.storage.local.get(KEY);
        history=Array.isArray(data[KEY])?data[KEY].filter(m=>['user','assistant'].includes(m.role)&&typeof m.content==='string').slice(-24):[];
        render();position();if(view==='chat')q('[data-compose] textarea').focus();
      }catch(e){status(e.message);}
    }
    // The user asked for the change in chat, so it applies at once; one-click undo stays available.
    async function applyProposal(value) {
      const box=q('[data-proposal]');box.replaceChildren();
      const allowed=['reference','human','opinion','question','length','style','punctuation','emoji','emojiFavorites','theme','autoRewrite','selectionComments','architectMode','triggerRepliesEnabled'];
      const patch=Object.fromEntries(Object.entries(value||{}).filter(([k])=>allowed.includes(k)));
      if(!Object.keys(patch).length)return false;
      const labels={reference:'口吻档案',human:'聊天感',opinion:'观点强度',question:'疑问倾向',length:'内容长度',style:'口吻',punctuation:'标点',emoji:'表情',emojiFavorites:'常用表情',theme:'皮肤',autoRewrite:'自动润色',selectionComments:'划词回复与讲解',architectMode:'架构师模式',triggerRepliesEnabled:'触发回复'};
      const {settings}=await request({type:'GET_SETTINGS'});
      const before=Object.fromEntries(Object.keys(patch).map(k=>[k,settings[k]]));
      const r=await request({type:'SAVE_SETTINGS',patch});
      const applied=Object.fromEntries(Object.keys(patch).map(k=>[k,r.settings[k]]));
      const p=document.createElement('p');p.textContent='已修改：'+Object.keys(patch).map(k=>labels[k]).join('、');box.append(p);
      const b=document.createElement('button');b.type='button';b.textContent='撤销';box.append(b);
      b.onclick=async()=>{b.disabled=true;try{
        const {settings:now}=await request({type:'GET_SETTINGS'});
        if(Object.keys(patch).some(k=>JSON.stringify(now[k])!==JSON.stringify(applied[k])))throw Error('设置已再次变化，为避免覆盖，不能撤销');
        await request({type:'SAVE_SETTINGS',patch:before});box.replaceChildren();status('已撤销');
      }catch(e){status(e.message);b.disabled=false;}};
      return true;
    }
    async function runPageAction(action) {
      const filter=globalThis.ZiliPageFilter;
      if(!action)return '';
      if(action.type==='copy_mode'){globalThis.ZiliPageCopy?.setActive(action.on);return action.on?'本页复制已开启，直接划选文字':'本页复制已关闭';}
      if(action.type==='subtitles'){
        if(action.on)await request({type:'GET_ENGINE_STATUS'});
        const r=globalThis.ZiliVideoSubtitles?.setActive(action.on);
        if(action.on&&!r?.ok)return '这一页没找到正在播放的视频';
        return action.on?'字幕翻译已开启，先打开播放器自带的英文字幕':'字幕翻译已关闭';
      }
      if(action.type==='capture'){close();const r=api.startCapture?.();return r&&!r.ok?'这一页不能框选':'';}
      // 改正在写的内容：直接替换输入框，旁边留一个“恢复原文”。
      if(action.type==='edit'){
        const r=api.editText?.({title:action.title,text:action.text});
        if(!r?.ok)return r?.error||'这一页没找到你在写的输入框，先点一下输入框再说';
        const what=(r.done||[]).join('和')||'内容';
        const box=q('[data-proposal]');
        const p=document.createElement('p');p.textContent=`已改好${what}`;
        const b=document.createElement('button');b.type='button';b.textContent='恢复原文';
        b.onclick=()=>{const u=api.restoreText?.();if(u?.ok){p.remove();b.remove();status('已恢复原文');}else status(u?.error||'恢复失败');};
        box.append(p,b);
        return `已改好${what}，发出前再看一眼`;
      }
      if(action.type==='restore_text'){const r=api.restoreText?.();return r?.ok?'已恢复原文':(r?.error||'没有可以恢复的原文');}
      if(action.type==='polish'){const r=api.polish?.();return r?.ok?'正在按你的口吻润色输入框里的内容…':(r?.error||'这一页没找到输入框');}
      if(action.type==='collect'){if(q('[data-view="collect"]').hidden)return '这一页用不了收纳';setView('collect');return '';}
      if(action.type==='tutor'){const r=await api.send({type:'ZILI_VOICE_TUTOR_OPEN'});if(r?.ok){close();return '';}return r?.error||'英语陪练没打开，请重试';}
      if(!filter)return '';
      if(action.type==='clean_ads'){const r=filter.cleanAds();return r.hidden?`已隐藏 ${r.hidden} 处广告`:'这一页没找到能识别的广告';}
      if(action.type==='restore'){filter.restore();return '已恢复本页';}
      status('正在整理这一页…');
      const r=await filter.filter(action.instruction);
      return r.ok?`看了 ${r.total} 条，隐藏 ${r.hidden} 条，往下滑也会接着筛`:r.error;
    }
    q('form').onsubmit=async event=>{event.preventDefault();const text=q('[data-compose] textarea').value.trim();if(!text&&!image)return status('先输入想说的话');if(busy)return status('上一条还在回复，稍等一下');busy=true;const id=++revision;q('button[type="submit"]').disabled=true;status('正在回复…');
      try{const r=await request({type:'ZILI_ASSIST',action:'chat',text,history:history.slice(-10).map(m=>({role:m.role,content:m.draft?`${m.content}\n${m.draft}`:m.content})),imageDataUrl:image?.dataUrl||'',page:pageSnapshot(),composer:api.composerText?.()||'',composerTitle:api.composerTitle?.()||''});if(id!==revision)return;history=[...history,{role:'user',content:text||'［发送了一张图片］'},{role:'assistant',content:r.text,...(r.draft?{draft:r.draft}:{})}].slice(-24);await chrome.storage.local.set({[KEY]:history});q('[data-compose] textarea').value='';clearImage();render();const changed=await applyProposal(r.proposal);const pageResult=await runPageAction(r.pageAction);if(r.pageAction)renderShortcuts((await request({type:'GET_SETTINGS'})).settings);status(pageResult||(changed?'已修改，可撤销':'已回复'));position();}catch(e){status(e.message);}finally{busy=false;q('button[type="submit"]').disabled=false;}};
    q('[data-compose] textarea').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&!global.ZiliKeyGuard?.isImeKey(e)){e.preventDefault();q('form').requestSubmit();}};
    q('[data-compose] textarea').onpaste=event=>{const item=[...Array.from(event.clipboardData?.items||[])].find(entry=>ACCEPTED_IMAGE_TYPES.has(entry.type));if(!item)return;selectImage(item.getAsFile()).catch(error=>status(error.message));};
    q('[data-add-image]').onclick=()=>q('[data-image-input]').click();
    q('[data-image-input]').onchange=event=>selectImage(event.target.files?.[0]).catch(error=>status(error.message));
    q('[data-remove-image]').onclick=()=>{clearImage();status('已移除图片');position();};
    q('[data-close]').onclick=close;
    global.addEventListener('resize',position);
    panel.querySelectorAll('[data-view="chat"],[data-view="tools"],[data-view="collect"]').forEach(b=>{b.onclick=()=>setView(b.dataset.view);});
    q('[data-view="result"]').onclick=()=>{close();api.showResult?.();};
    panel.querySelectorAll('[data-tool]').forEach(b=>{b.onclick=()=>void runTool(b.dataset.tool);});
    function toggle() {
      if(panel.hidden)return open('chat');
      // 点猫在 对话 → 功能 → 收纳 之间轮换。
      const order=collect?['chat','tools','collect']:['chat','tools'];
      setView(order[(order.indexOf(panel.dataset.view)+1)%order.length]);
    }
    return {open,close,position,toggle};
  }
  global.ZiliCompanionChat={attach,welcome,pageSnapshot};
})(globalThis);
