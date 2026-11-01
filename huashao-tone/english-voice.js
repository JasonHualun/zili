(function(g) {
  function attach(container, getText, report) {
    let playing = false, generation = 0, onState = () => {};
    function stop() { generation++; g.speechSynthesis?.cancel(); playing = false; onState(false); }
    async function toggle() {
      if (playing) return stop();
      const voice = g.speechSynthesis?.getVoices().find(v => v.name === 'Google US English' && /^en-US$/i.test(v.lang));
      if (!voice || !g.SpeechSynthesisUtterance) return report('Google US English 声音暂不可用，请稍后重试；不会改用其他声音');
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
