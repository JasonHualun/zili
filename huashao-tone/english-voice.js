(function(g) {
  // Google US English sounds best, but only Chrome ships it (豆包、Edge、Safari don't).
  // Fall back to a natural-sounding system English voice, skipping macOS novelty voices.
  const NOVELTY = /^(?:Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Junior|Ralph|Fred|Kathy|Grandma|Grandpa|Eddy|Flo|Reed|Rocko|Sandy|Shelley)\b/i;
  const PREFERRED = /Samantha|Ava|Allison|Susan|Alex|Aria|Jenny|Guy|Zira|David|Natural|Premium|Enhanced/i;
  function rank(v) {
    if (v.name === 'Google US English' && /^en-US$/i.test(v.lang)) return 0;
    if (!/^en[-_]/i.test(v.lang || '') || NOVELTY.test(v.name || '')) return 99;
    const us = /^en[-_]US$/i.test(v.lang) ? 0 : 3;
    return 1 + us + (PREFERRED.test(v.name || '') ? 0 : 1) + (/^Google/i.test(v.name || '') ? 0 : 1);
  }
  function pickVoice(voices) {
    return voices.map(v => ({ v, r: rank(v) })).filter(x => x.r < 99).sort((a, b) => a.r - b.r)[0]?.v || null;
  }
  function loadVoices() {
    const now = g.speechSynthesis?.getVoices() || [];
    if (now.length || !g.speechSynthesis?.addEventListener) return Promise.resolve(now);
    // Some browsers fill the voice list a moment after page load.
    return new Promise(resolve => {
      const done = () => { g.speechSynthesis.removeEventListener('voiceschanged', done); resolve(g.speechSynthesis.getVoices() || []); };
      g.speechSynthesis.addEventListener('voiceschanged', done);
      setTimeout(done, 1200);
    });
  }
  function attach(container, getText, report) {
    let playing = false, generation = 0, onState = () => {};
    function stop() { generation++; g.speechSynthesis?.cancel(); playing = false; onState(false); }
    async function toggle() {
      if (playing) return stop();
      const voice = pickVoice(await loadVoices());
      if (!voice || !g.SpeechSynthesisUtterance) return report('这个浏览器里没有可用的英语朗读声音，请换 Chrome 或在系统设置里添加英语语音');
      const input = getText();
      const parts = [...new Set((Array.isArray(input) ? input : [input]).map(t => String(t || '').replace(/[\u3400-\u9fff]+/g, ' ').trim()).filter(t => /[a-z]/i.test(t)))];
      if (!parts.length) return report('没有可朗读的英文');
      stop();
      const id = generation;
      function play(index) {
      if (id !== generation) return;
      const u = new g.SpeechSynthesisUtterance(parts[index]);
      u.voice = voice; u.lang = voice.lang; u.rate = .9; u.volume = .65;
      playing = true; onState(true);
      u.onend = () => { if (id === generation) { if (index + 1 < parts.length) { play(index + 1); } else { playing = false; onState(false); } } };
      u.onerror = () => { if (id === generation) { playing = false; onState(false); report('朗读失败，请稍后重试'); } };
      g.speechSynthesis.speak(u);
      }
      play(0);
    }
    return { stop, toggle, setState(fn) { onState = fn; } };
  }
  g.ZiliEnglishVoice = { attach };
})(globalThis);
