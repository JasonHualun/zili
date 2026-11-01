(function (global) {
  // 「收纳」视图：采集当前页 → 保存 / 做选题 / 加入待收纳；回执来自本地 Agent（经字里桥）。
  const QUEUE_KEY = 'ziliCollectQueue';
  const QUEUE_LIMIT = 30;
  const POLL_MS = 5000;
  const STATUS_LABELS = { running: '收纳中', done: '已完成', failed: '失败' };

  // 插件刚刷新过、这个网页还没刷新时，网页里的旧脚本就联系不上插件了，跟字里桥无关。
  function friendlyError(error) {
    if (/runtime_unavailable|message_port_closed|empty_response/i.test(error || '')) return '插件刚更新过，这个网页还没刷新。按一下 ⌘R 刷新网页就好（字里桥没问题）';
    if (/runtime_timeout/i.test(error || '')) return '本地 Agent 这次没及时回应，点「重试」再试一次';
    return error;
  }

  function clip(value, max) { return String(value || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max); }

  const KIND_LABELS = { selection: '选中的文字', post: '这条帖子', page: '整个网页' };

  // 当前页能收的几种内容，按值得收的程度排：选中的文字 > 帖子正文 > 文章/主体全文。
  // 打开面板时一次取齐：点进面板后页面上的选区可能就没了。
  function captureSources() {
    const snap = global.ZiliCompanionChat.pageSnapshot();
    const selection = clip(getSelection?.(), 20000);
    const main = document.querySelector('article, main, [role=main]') || document.body;
    // 网页翻译会把正文和标题都翻掉；og:title 是网站写给分享卡片的原文标题，不受翻译影响。
    const meta = name => document.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.content?.trim();
    const title = meta('og:title') || meta('twitter:title') || snap.title || document.title;
    const base = { title, url: location.href, author: snap.author, at: new Date().toLocaleString('zh-CN', { hour12: false }) };
    const texts = {
      selection,
      post: snap.post ? [snap.post, snap.description].filter(Boolean).join('\n\n') : '',
      page: clip(main?.innerText, 40000)
    };
    return Object.keys(KIND_LABELS).filter(kind => kind === 'page' || texts[kind]).map(kind => ({ ...base, kind, text: texts[kind] }));
  }

  function captureItem() { return captureSources()[0]; }

  async function shrink(dataUrl) {
    const img = new Image();
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = dataUrl; });
    const scale = Math.min(1, 1600 / img.naturalWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale); canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.82);
  }

  function attach(container, api) {
    const box = document.createElement('div');
    box.dataset.collect = '';
    // Icons: Remix Icon v4.6.0 (Apache-2.0) paths.
    const icon = d => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
    const ICON = {
      save: 'M4 3H20C20.5523 3 21 3.44772 21 4V20C21 20.5523 20.5523 21 20 21H4C3.44772 21 3 20.5523 3 20V4C3 3.44772 3.44772 3 4 3ZM5 5V19H19V5H5ZM11 7H13V12H16L12 16L8 12H11V7Z',
      topic: 'M9.97308 18H11V13H13V18H14.0269C14.1589 16.7984 14.7721 15.8065 15.7676 14.7226C15.8797 14.6006 16.5988 13.8564 16.6841 13.7501C17.5318 12.6931 18 11.385 18 10C18 6.68629 15.3137 4 12 4C8.68629 4 6 6.68629 6 10C6 11.3843 6.46774 12.6917 7.31462 13.7484C7.40004 13.855 8.12081 14.6012 8.23154 14.7218C9.22766 15.8064 9.84103 16.7984 9.97308 18ZM10 20V21H14V20H10ZM5.75395 14.9992C4.65645 13.6297 4 11.8915 4 10C4 5.58172 7.58172 2 12 2C16.4183 2 20 5.58172 20 10C20 11.8925 19.3428 13.6315 18.2443 15.0014C17.624 15.7748 16 17 16 18.5V21C16 22.1046 15.1046 23 14 23H10C8.89543 23 8 22.1046 8 21V18.5C8 17 6.37458 15.7736 5.75395 14.9992Z',
      queue: 'M11 11V5H13V11H19V13H13V19H11V13H5V11H11Z',
      shot: 'M9.82843 5L7.82843 7H4V19H20V7H16.1716L14.1716 5H9.82843ZM9 3H15L17 5H21C21.5523 5 22 5.44772 22 6V20C22 20.5523 21.5523 21 21 21H3C2.44772 21 2 20.5523 2 20V6C2 5.44772 2.44772 5 3 5H7L9 3ZM12 18C8.96243 18 6.5 15.5376 6.5 12.5C6.5 9.46243 8.96243 7 12 7C15.0376 7 17.5 9.46243 17.5 12.5C17.5 15.5376 15.0376 18 12 18ZM12 16C13.933 16 15.5 14.433 15.5 12.5C15.5 10.567 13.933 9 12 9C10.067 9 8.5 10.567 8.5 12.5C8.5 14.433 10.067 16 12 16Z',
      warn: 'M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM12 20C16.4183 20 20 16.4183 20 12C20 7.58172 16.4183 4 12 4C7.58172 4 4 7.58172 4 12C4 16.4183 7.58172 20 12 20ZM11 15H13V17H11V15ZM11 7H13V13H11V7Z'
    };
    box.innerHTML = `<div class="c-card"><div class="c-kinds" data-kinds><span>收什么</span></div><div class="c-item"><img data-favicon alt=""><div class="c-meta"><strong data-title></strong><em data-host></em></div></div><p class="c-excerpt" data-excerpt></p></div><div class="c-note"><textarea data-note maxlength="500" rows="1" placeholder="为什么收它？写一句备注（可不填）"></textarea><label class="c-shot" title="把现在屏幕上看到的画面也一起存下"><input type="checkbox" data-shot>${icon(ICON.shot)}<span>带截图</span></label></div><div class="c-alert" data-alert hidden>${icon(ICON.warn)}<p data-alert-text></p><button type="button" data-retry>重试</button></div><button type="button" class="c-main" data-intent="save">${icon(ICON.save)}<span data-main-label>收纳整个网页</span><small data-agent></small></button><div class="c-more"><button type="button" data-intent="topic">${icon(ICON.topic)}做成选题</button><button type="button" data-queue-add>${icon(ICON.queue)}攒着一起收</button></div><section data-queue hidden><header><span data-queue-count></span><button type="button" data-queue-clear>清空</button></header><ul></ul><div class="c-more"><button type="button" class="strong" data-queue-send="save">全部收纳</button><button type="button" data-queue-send="topic">全部做选题</button></div></section><section data-jobs hidden><header>最近收纳</header><ul></ul></section>`;
    const css = document.createElement('style');
    css.textContent = `.companion-chat [data-collect]{display:grid;gap:10px}
.companion-chat:not([data-view=collect]) [data-collect],.companion-chat[data-view=collect] [data-tools],.companion-chat[data-view=collect] [data-messages],.companion-chat[data-view=collect] [data-proposal],.companion-chat[data-view=collect] [data-shortcuts],.companion-chat[data-view=collect] form{display:none!important}
.companion-chat [data-collect] svg{width:16px;height:16px;fill:currentColor;flex:none}
.companion-chat .c-card{display:grid;gap:8px;padding:10px;border-radius:14px;background:#fff;box-shadow:0 1px 3px #0000000d}
.companion-chat .c-kinds{display:flex;align-items:center;gap:4px;padding:3px;border-radius:10px;background:#f1f4f6}
.companion-chat .c-kinds span{flex:none;padding:0 6px 0 4px;color:#8a929a;font-size:11px}
.companion-chat .c-kinds button{flex:1;min-width:0;padding:4px 2px!important;border-radius:8px!important;background:transparent!important;color:#5d6a75!important;font-size:12px!important;white-space:nowrap}
.companion-chat .c-kinds button[aria-pressed=true]{background:#fff!important;color:var(--zili-accent-strong,#426b91)!important;font-weight:600;box-shadow:0 1px 2px #00000014}
.companion-chat .c-kinds button:disabled{opacity:.4;cursor:default}
.companion-chat .c-item{display:flex;align-items:center;gap:8px;min-width:0}
.companion-chat .c-item img{width:20px;height:20px;flex:none;border-radius:5px}
.companion-chat .c-item img[hidden]{display:none}
.companion-chat .c-meta{display:grid;min-width:0}
.companion-chat .c-meta strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}
.companion-chat .c-meta em{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-style:normal;color:#8a929a;font-size:11px}
.companion-chat .c-excerpt{margin:0;padding:7px 9px;max-height:58px;border-left:3px solid color-mix(in srgb,var(--zili-accent,#557fa8) 35%,#fff);border-radius:4px;background:#f7f9fa;color:#5d6a75;font-size:12px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.companion-chat .c-excerpt.empty{border-left-color:#e8c08a;background:#fdf8f0;color:#8a6a3c}
.companion-chat .c-note{display:flex;align-items:center;gap:4px;padding:3px 4px 3px 10px;border:1px solid #0000001a;border-radius:12px;background:#fff}
.companion-chat .c-note:focus-within{border-color:var(--zili-accent,#557fa8)}
.companion-chat [data-note]{flex:1;min-width:0;padding:5px 0;border:0;outline:0;background:transparent;color:inherit;font:inherit;font-size:12px;resize:none;field-sizing:content;max-height:90px}
.companion-chat .c-shot{display:flex;align-items:center;gap:3px;padding:4px 8px;border-radius:9px;color:#8a96a1;font-size:12px;cursor:pointer;white-space:nowrap}
.companion-chat .c-shot input{display:none}
.companion-chat .c-shot:has(input:checked){color:#fff;background:var(--zili-accent,#557fa8)}
.companion-chat .c-main{display:flex;align-items:center;justify-content:center;gap:6px;padding:10px 12px!important;border-radius:12px!important;color:#fff!important;background:var(--zili-accent,#557fa8)!important;font-size:14px!important;font-weight:600}
.companion-chat .c-main small{font-weight:400;opacity:.75;font-size:11px}
.companion-chat .c-main:hover{background:var(--zili-accent-strong,#426b91)!important}
.companion-chat .c-main:disabled{opacity:.55}
.companion-chat .c-more{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.companion-chat .c-more button{display:flex;align-items:center;justify-content:center;gap:4px;padding:7px 8px;border-radius:10px;background:#fff;font-size:12px;white-space:nowrap}
.companion-chat .c-more button.strong{color:#fff;background:var(--zili-accent,#557fa8)}
.companion-chat .c-alert{display:flex;align-items:flex-start;gap:8px;padding:9px 10px;border-radius:10px;background:#fdf3e7;color:#8a5a1c;font-size:12px}
.companion-chat .c-alert[hidden]{display:none}
.companion-chat .c-alert p{flex:1;margin:0;overflow-wrap:anywhere}
.companion-chat .c-alert svg{margin-top:2px}
.companion-chat .c-alert button{flex:none;padding:2px 10px;background:#fff;color:#8a5a1c}
.companion-chat [data-collect] section{display:grid;gap:6px;padding-top:10px;border-top:1px solid #0000000f}
.companion-chat [data-collect] section header{display:flex;align-items:center;justify-content:space-between;color:#7d8790;font-size:12px}
.companion-chat [data-collect] section header button{padding:2px 8px;background:transparent;color:#8a96a1}
.companion-chat [data-collect] ul{display:grid;gap:4px;margin:0;padding:0;list-style:none;max-height:180px;overflow:auto}
.companion-chat [data-collect] li{display:grid;gap:2px;padding:7px 9px;border-radius:10px;background:#fff;font-size:12px}
.companion-chat [data-collect] li div{display:flex;align-items:center;gap:6px;min-width:0}
.companion-chat [data-collect] li div span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.companion-chat [data-collect] li i{flex:none;font-style:normal;font-size:11px;padding:0 6px;border-radius:6px;background:#0000000a;color:#7d8790}
.companion-chat [data-collect] li i.ok{background:#e6f4ea;color:#2f7a45}
.companion-chat [data-collect] li i.bad{background:#fbeaea;color:#a34040}
.companion-chat [data-collect] li i.run{background:color-mix(in srgb,var(--zili-accent,#557fa8) 14%,#fff);color:var(--zili-accent-strong,#426b91)}
.companion-chat [data-collect] li pre{margin:2px 0 0;white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;color:#5d6a75}
.companion-chat [data-collect] li button{flex:none;padding:0 6px;background:transparent;color:#8a96a1}
`;
    container.append(css);
    let current = null, poll = 0, ready = false;
    const q = selector => box.querySelector(selector);
    const send = message => global.ZiliRuntime.send(message, { timeoutMs: 20000 });
    const readQueue = async () => { const d = await chrome.storage.local.get(QUEUE_KEY).catch(() => ({})); return Array.isArray(d[QUEUE_KEY]) ? d[QUEUE_KEY] : []; };
    const writeQueue = queue => chrome.storage.local.set({ [QUEUE_KEY]: queue.slice(0, QUEUE_LIMIT) });
    const setBusy = on => box.querySelectorAll('button:not([data-kind])').forEach(b => { b.disabled = on || (!ready && !b.matches('[data-queue-clear],[data-queue-add],[data-retry],li button')); });

    async function withShot(item) {
      if (!q('[data-shot]').checked) return item;
      api.hideForCapture?.(true);
      await new Promise(r => setTimeout(r, 120));
      try {
        const r = await send({ type: 'CAPTURE_VISIBLE_TAB' });
        return r?.ok ? { ...item, screenshot: await shrink(r.dataUrl) } : item;
      } finally { api.hideForCapture?.(false); }
    }

    let sources = [];
    function renderItem(kind) {
      current = sources.find(item => item.kind === kind) || sources[0];
      const label = KIND_LABELS[current.kind];
      q('[data-kinds]').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.kind === current.kind)));
      q('[data-main-label]').textContent = `收纳${label}`;
      q('[data-title]').textContent = current.title || '未命名';
      q('[data-host]').textContent = location.hostname;
      const fav = document.querySelector('link[rel~="icon"]')?.href || `${location.origin}/favicon.ico`;
      q('[data-favicon]').hidden = false; q('[data-favicon]').src = fav; q('[data-favicon]').onerror = () => { q('[data-favicon]').hidden = true; };
      const thin = current.kind === 'page' && current.text.length < 80;
      q('[data-excerpt]').textContent = thin ? '这一页文字很少（可能是 3D、视频或图片页），已自动勾上截图，Agent 才看得到页面长什么样' : current.text.slice(0, 160);
      q('[data-excerpt]').classList.toggle('empty', thin);
      q('[data-shot]').checked = thin;
      api.position?.();
    }

    function renderKinds() {
      sources = captureSources();
      const row = q('[data-kinds]');
      row.querySelectorAll('button').forEach(b => b.remove());
      Object.entries(KIND_LABELS).forEach(([kind, label]) => {
        const b = document.createElement('button');
        b.type = 'button'; b.dataset.kind = kind; b.textContent = label.replace(/^(这条|整个)/, '').replace('的文字', '文字');
        const has = sources.some(item => item.kind === kind);
        b.disabled = !has;
        b.title = has ? `只收${label}` : kind === 'selection' ? '先在页面上用鼠标选中一段文字，再打开这里' : '这一页认不出单独的帖子';
        b.onclick = () => renderItem(kind);
        row.append(b);
      });
      renderItem(sources[0].kind);
    }

    async function renderQueue() {
      const queue = await readQueue();
      q('[data-queue]').hidden = !queue.length;
      q('[data-queue-count]').textContent = `待收纳 ${queue.length} 条`;
      q('[data-queue] ul').replaceChildren(...queue.map((item, index) => {
        const li = document.createElement('li'), row = document.createElement('div'), title = document.createElement('span'), remove = document.createElement('button');
        title.textContent = `${item.screenshot ? '［截图］' : ''}${item.title || item.url}`;
        remove.type = 'button'; remove.textContent = '移除';
        remove.onclick = async () => { const next = await readQueue(); next.splice(index, 1); await writeQueue(next); renderQueue(); api.position?.(); };
        row.append(title, remove); li.append(row); return li;
      }));
    }

    function renderJobs(jobs) {
      q('[data-jobs]').hidden = !jobs.length;
      q('[data-jobs] ul').replaceChildren(...jobs.slice(0, 6).map(job => {
        const li = document.createElement('li'), row = document.createElement('div'), badge = document.createElement('i'), title = document.createElement('span');
        const label = job.status === 'done' ? (job.result || '已完成') : STATUS_LABELS[job.status] || job.status;
        badge.textContent = `${job.intent === 'topic' ? '选题 · ' : ''}${label}`;
        badge.className = job.status === 'running' ? 'run' : job.status === 'failed' || job.result === '已拒收' ? 'bad' : 'ok';
        title.textContent = job.title;
        row.append(badge, title); li.append(row);
        if (job.receipt) {
          const pre = document.createElement('pre');
          pre.textContent = job.receipt.split('\n').filter(l => !/^状态[:：]/.test(l)).join('\n').trim() || job.receipt;
          li.append(pre);
        }
        return li;
      }));
      clearTimeout(poll);
      if (jobs.some(job => job.status === 'running') && box.isConnected) poll = setTimeout(refreshJobs, POLL_MS);
    }

    async function refreshJobs() {
      if (container.hidden || container.dataset.view !== 'collect') return;
      const r = await send({ type: 'ZILI_COLLECT_STATUS' });
      if (r?.ok) { renderJobs(r.jobs); api.position?.(); }
    }

    async function submit(items, intent) {
      setBusy(true); api.status('正在交给本地 Agent…');
      try {
        const r = await send({ type: 'ZILI_COLLECT_SUBMIT', items, intent, note: q('[data-note]').value.trim() });
        if (!r?.ok) throw Error(friendlyError(r?.error) || '收纳失败，请重试');
        q('[data-note]').value = '';
        api.status(`已交给 ${r.job.agent}，做完会在这里显示回执`);
        return true;
      } catch (e) { alert(e.message); api.status(''); return false; }
      finally { setBusy(false); refreshJobs(); }
    }

    box.querySelectorAll('[data-intent]').forEach(b => { b.onclick = async () => submit([await withShot(current)], b.dataset.intent); });
    q('[data-queue-add]').onclick = async () => {
      const queue = await readQueue();
      if (queue.length >= QUEUE_LIMIT) return api.status(`待收纳最多 ${QUEUE_LIMIT} 条，先发出去一批`);
      const item = await withShot(current);
      if (!item.screenshot && queue.some(i => i.url === item.url && i.text === item.text)) return api.status('这一条已经在待收纳里了');
      await writeQueue([...queue, item]); await renderQueue();
      api.status(`已加入待收纳，共 ${queue.length + 1} 条`); api.position?.();
    };
    q('[data-queue-clear]').onclick = async () => { await writeQueue([]); renderQueue(); api.position?.(); };
    box.querySelectorAll('[data-queue-send]').forEach(b => { b.onclick = async () => {
      const queue = await readQueue();
      if (queue.length && await submit(queue, b.dataset.queueSend)) { await writeQueue([]); renderQueue(); }
    }; });

    function alert(text) {
      q('[data-alert]').hidden = !text;
      q('[data-alert-text]').textContent = text || '';
      api.position?.();
    }

    async function show() {
      renderKinds(); renderQueue(); alert('');
      const r = await send({ type: 'ZILI_COLLECT_DETECT' });
      const agent = r?.ok ? r.agents.find(a => a.id === r.selected) : null;
      ready = Boolean(agent);
      q('[data-agent]').textContent = agent ? `· ${agent.label}` : '';
      setBusy(false);
      if (!r?.ok && friendlyError(r?.error) !== r?.error) alert(friendlyError(r.error));
      else if (!r?.ok) alert(`${r?.error || '字里桥没有响应'}。可以先点「攒着一起收」，连上后再一起发。`);
      else if (!agent) alert('设置里选的 Agent 不在这台电脑上，去设置 → 本地收纳换一个');
      refreshJobs();
    }
    q('[data-retry]').onclick = () => void show();

    return { element: box, show };
  }

  global.ZiliCollectPanel = { attach, captureItem };
})(globalThis);
