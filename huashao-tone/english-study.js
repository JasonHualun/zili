(function(g) {
  function blocks(result, source) {
    const s = result?.study || {}, items = [];
    const add = (label, text) => { if (text) items.push({label, text}); };
    add(s.kind === 'paragraph' ? '段落精读' : s.kind === 'sentence' ? '句子精读' : '词语学习', source);
    if(s.kind === 'word') { add('词性', s.partOfSpeech); add('构词记忆', s.formation); }
    add('重点表达', (s.expressions || []).map(x=>x.text+' · '+x.meaning).join('\n'));
    add('句子拆解', (s.breakdown || []).map(x=>x.text+'\n'+x.meaning).join('\n\n'));
    add('用法提示', s.usage || result?.lesson);
    add('举一反三', result?.example);
    add('例句译文', result?.exampleTranslation);
    return items;
  }
  function render(node, result, source) {
    node.replaceChildren();
    for(const item of blocks(result,source)) {
      const section=document.createElement('section'), label=document.createElement('h4'), text=document.createElement('p');
      label.textContent=item.label; text.textContent=item.text;
      section.append(label,text); node.append(section);
    }
  }
  g.ZiliEnglishStudy={blocks,render};
})(globalThis);
