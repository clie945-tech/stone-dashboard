/* ═══════════════════════════════════════════════════════════
   高雄國中題庫組卷平台
   ‧ 純前端：資料存在瀏覽器 localStorage，以 JSON 匯出／匯入備份與共用。
   ‧ 題目結構：
     { id, subject, term:'7上', unit:'單元名稱', type, difficulty:1|2|3,
       stem, options:[], answer, explanation, tags:[],
       source:{ school, year, exam }, used:0, createdAt }
═══════════════════════════════════════════════════════════ */
const STORE_KEY = 'khExamDB_v1';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const DIFF_NAME = { 1: '易', 2: '中', 3: '難' };
const LETTERS = 'ABCDE';

/* ─────────────── 資料庫 ─────────────── */
let DB;
function freshDB(){
  return {
    version: 1,
    settings: { school: '高雄市立陽明國民中學', header: '高雄市立陽明國中', textbook: '' },
    curriculum: JSON.parse(JSON.stringify(window.DEFAULT_CURRICULUM)),
    questions: (window.SEED_QUESTIONS || []).map(q => normalizeQ(q)),
    papers: []
  };
}
function loadDB(){
  try{
    const raw = localStorage.getItem(STORE_KEY);
    DB = raw ? JSON.parse(raw) : freshDB();
  }catch(e){ DB = freshDB(); }
  DB.settings = DB.settings || {};
  DB.curriculum = DB.curriculum || JSON.parse(JSON.stringify(window.DEFAULT_CURRICULUM));
  DB.questions = (DB.questions || []).map(normalizeQ);
  DB.papers = DB.papers || [];
}
function saveDB(){
  try{ localStorage.setItem(STORE_KEY, JSON.stringify(DB)); }
  catch(e){ alert('儲存失敗：瀏覽器空間可能已滿，請先匯出備份。\n' + e.message); }
}
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function normalizeQ(q){
  return {
    id: q.id || uid(),
    subject: q.subject || '數學',
    term: q.term || '7上',
    unit: q.unit || '',
    type: window.QTYPES[q.type] ? q.type : 'single',
    difficulty: [1,2,3].includes(+q.difficulty) ? +q.difficulty : 2,
    stem: String(q.stem || '').trim(),
    options: (q.options || []).map(o => String(o).trim()).filter(Boolean),
    answer: String(q.answer ?? '').trim(),
    explanation: String(q.explanation || '').trim(),
    tags: Array.isArray(q.tags) ? q.tags : String(q.tags || '').split(/[,，、]/).map(s => s.trim()).filter(Boolean),
    source: { school: q.source?.school || '', year: String(q.source?.year || ''), exam: q.source?.exam || '' },
    used: +q.used || 0,
    createdAt: q.createdAt || new Date().toISOString()
  };
}
const qKey = q => q.subject + '|' + q.stem.replace(/\s+/g, '');
function addQuestions(list){
  const seen = new Set(DB.questions.map(qKey));
  let added = 0, dup = 0;
  list.forEach(q => {
    q = normalizeQ(q);
    if(!q.stem){ return; }
    if(seen.has(qKey(q))){ dup++; return; }
    seen.add(qKey(q)); DB.questions.push(q); added++;
  });
  saveDB();
  return { added, dup };
}
const units = (subject, term) => (DB.curriculum[subject] || {})[term] || [];
const schools = () => [...new Set(DB.questions.map(q => q.source.school).filter(Boolean))].sort();

/* ─────────────── 共用工具 ─────────────── */
function esc(s){ return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
// 題目文字 → HTML：跳脫後處理圖片、填充空格、換行；數學式交給 KaTeX
function fmt(s){
  return esc(s)
    .replace(/!\[([^\]]*)\]\(((?:https?:\/\/|data:image\/)[^)\s]+)\)/g, (m, alt, url) => `<img class="qimg" alt="${alt}" src="${url}">`)
    .replace(/_{3,}/g, '<span class="blank"></span>')
    .replace(/\n/g, '<br>');
}
function renderMath(el){
  if(window.renderMathInElement && el){
    try{
      renderMathInElement(el, { delimiters: [ { left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false } ], throwOnError: false });
    }catch(e){}
  }
}
function toast(msg){ const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2200); }
function fillSelect(sel, items, allLabel){
  const el = typeof sel === 'string' ? $(sel) : sel;
  const cur = el.value;
  el.innerHTML = (allLabel ? `<option value="">${allLabel}</option>` : '') +
    items.map(i => typeof i === 'object' ? `<option value="${esc(i.v)}">${esc(i.t)}</option>` : `<option>${esc(i)}</option>`).join('');
  if([...el.options].some(o => o.value === cur)) el.value = cur;
}
function download(name, text, type){
  const blob = new Blob([text], { type: type || 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function readFile(file){ return new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsText(file, 'utf-8'); }); }
// 可重現的亂數（同一個種子產生同一份卷子）
function rng(seed){
  let h = 1779033703 ^ String(seed).length;
  for(const ch of String(seed)){ h = Math.imul(h ^ ch.charCodeAt(0), 3432918353); h = h << 13 | h >>> 19; }
  return () => { h = Math.imul(h ^ h >>> 16, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
}
function shuffle(arr, rand){ const a = arr.slice(); for(let i = a.length - 1; i > 0; i--){ const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/* ─────────────── 分頁切換 ─────────────── */
function showTab(name){
  window.scrollTo(0, 0);
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
  $$('.tab').forEach(t => t.classList.toggle('on', t.id === 'tab-' + name));
  ({ dash: renderDash, bank: renderBank, gen: renderGenForm, curr: renderCurr, src: renderCoverage })[name]?.();
}
$$('#tabs button').forEach(b => b.onclick = () => showTab(b.dataset.tab));
$$('.subtabs button').forEach(b => b.onclick = () => {
  $$('.subtabs button').forEach(x => x.classList.toggle('on', x === b));
  $$('.sub').forEach(s => s.classList.toggle('on', s.id === 'sub-' + b.dataset.sub));
});

/* ─────────────── 總覽 ─────────────── */
function bars(el, entries){
  const max = Math.max(1, ...entries.map(e => e[1]));
  $(el).innerHTML = entries.length ? entries.map(([k, v]) =>
    `<div class="bar-row"><span class="lbl" title="${esc(k)}">${esc(k)}</span><span class="bar"><i style="width:${v / max * 100}%"></i></span><span class="n">${v}</span></div>`).join('')
    : '<div class="muted">尚無資料</div>';
}
function countBy(fn){ const m = {}; DB.questions.forEach(q => { const k = fn(q); m[k] = (m[k] || 0) + 1; }); return m; }
function renderDash(){
  const main = DB.settings.school || '';
  const mainN = DB.questions.filter(q => main && q.source.school === main).length;
  const kp = [
    ['題目總數', DB.questions.length],
    [`${main.replace(/^高雄市立/, '') || '本校'}考古題`, mainN],
    ['來源學校數', schools().length],
    ['已產生卷子', DB.papers.length]
  ];
  $('#kpis').innerHTML = kp.map(([l, v]) => `<div class="kpi"><div class="v">${v}</div><div class="l">${esc(l)}</div></div>`).join('');
  const bs = countBy(q => q.subject);
  bars('#chartSubject', window.SUBJECTS.map(s => [s, bs[s] || 0]));
  const bt = countBy(q => q.term);
  bars('#chartTerm', window.TERMS.map(t => [t, bt[t] || 0]));
  bars('#chartSchool', Object.entries(countBy(q => q.source.school || '（未填）')).sort((a, b) => b[1] - a[1]).slice(0, 10));
  $('#recentPapers').innerHTML = DB.papers.length ? DB.papers.slice(-8).reverse().map(p =>
    `<div class="bar-row" style="grid-template-columns:1fr auto auto"><span class="lbl">${esc(p.title)}</span><span class="muted">${esc(p.date.slice(0, 10))}</span><button data-paper="${p.id}">重開</button></div>`).join('')
    : '<div class="muted">尚未產生過卷子</div>';
  $$('#recentPapers [data-paper]').forEach(b => b.onclick = () => reopenPaper(b.dataset.paper));
  $('#setSchool').value = DB.settings.school || '';
  $('#setHeader').value = DB.settings.header || '';
  $('#setTextbook').value = DB.settings.textbook || '';
  $('#brandSchool').textContent = (DB.settings.header || DB.settings.school || '高雄市國中') + '・歷年課程與考題資料庫';
}
$('#btnSaveSettings').onclick = () => {
  DB.settings.school = $('#setSchool').value.trim();
  DB.settings.header = $('#setHeader').value.trim();
  DB.settings.textbook = $('#setTextbook').value;
  saveDB(); renderDash(); toast('設定已儲存');
};
$('#btnExport').onclick = () => download(`題庫備份_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(DB, null, 1));
$('#fileImportDB').onchange = async e => {
  const f = e.target.files[0]; if(!f) return;
  try{
    const data = JSON.parse(await readFile(f));
    const qs = Array.isArray(data) ? data : data.questions || [];
    const replace = !Array.isArray(data) && confirm(`檔案內有 ${qs.length} 題。\n按「確定」＝完整取代目前資料庫（含課程架構與設定）\n按「取消」＝只把題目合併進來（重複題自動略過）`);
    if(replace){
      DB = data; loadDBFrom(DB); saveDB(); toast(`已取代，共 ${DB.questions.length} 題`);
    }else{
      const r = addQuestions(qs); toast(`新增 ${r.added} 題，略過重複 ${r.dup} 題`);
    }
    renderDash();
  }catch(err){ alert('無法讀取 JSON：' + err.message); }
  e.target.value = '';
};
function loadDBFrom(d){ localStorage.setItem(STORE_KEY, JSON.stringify(d)); loadDB(); }
$('#btnReset').onclick = () => {
  if(!confirm('確定清空整個資料庫？建議先匯出備份。')) return;
  const keepSeed = confirm('要保留平台範例題嗎？（確定＝保留範例題，取消＝完全清空）');
  DB = freshDB(); if(!keepSeed) DB.questions = [];
  saveDB(); renderDash(); toast('已重設');
};

/* ─────────────── 題庫瀏覽 ─────────────── */
let bankPage = 0;
const PAGE = 30;
function bankFilters(){
  fillSelect('#fSubject', window.SUBJECTS, '全部科目');
  fillSelect('#fTerm', window.TERMS, '全部學期');
  const s = $('#fSubject').value, t = $('#fTerm').value;
  const us = s && t ? units(s, t) : [...new Set(DB.questions.filter(q => (!s || q.subject === s) && (!t || q.term === t)).map(q => q.unit).filter(Boolean))];
  fillSelect('#fUnit', us, '全部單元');
  fillSelect('#fType', Object.entries(window.QTYPES).map(([v, o]) => ({ v, t: o.name })), '全部題型');
  fillSelect('#fSchool', schools(), '全部來源');
}
function bankResult(){
  const f = { s: $('#fSubject').value, t: $('#fTerm').value, u: $('#fUnit').value, ty: $('#fType').value, d: $('#fDiff').value, sc: $('#fSchool').value, k: $('#fKey').value.trim().toLowerCase() };
  return DB.questions.filter(q =>
    (!f.s || q.subject === f.s) && (!f.t || q.term === f.t) && (!f.u || q.unit === f.u) && (!f.ty || q.type === f.ty) &&
    (!f.d || q.difficulty === +f.d) && (!f.sc || q.source.school === f.sc) &&
    (!f.k || (q.stem + q.explanation + q.tags.join(' ') + q.options.join(' ')).toLowerCase().includes(f.k)));
}
function qCardHTML(q, actions){
  const src = [q.source.school, q.source.year && q.source.year + '學年度', q.source.exam].filter(Boolean).join(' ');
  const opts = q.options.length ? optionsHTML(q.options) : '';
  return `<div class="qitem">
    <div class="qmeta"><span class="tag">${esc(q.subject)} ${esc(q.term)}</span><span class="tag g">${esc(q.unit || '未分單元')}</span>
      <span class="tag g">${window.QTYPES[q.type].name}</span><span class="tag d${q.difficulty}">${DIFF_NAME[q.difficulty]}</span>
      ${src ? `<span class="tag g">📄 ${esc(src)}</span>` : ''}${q.used ? `<span class="tag g">已出 ${q.used} 次</span>` : ''}
      ${q.tags.map(t => `<span class="tag g">#${esc(t)}</span>`).join('')}
      ${actions ? `<span class="qactions"><button data-edit="${q.id}">編輯</button><button data-del="${q.id}" class="danger">刪除</button></span>` : ''}</div>
    <div>${fmt(q.stem)}</div>${opts}
    <div class="qans">答案：${fmt(answerText(q))}</div>
    ${q.explanation ? `<div class="qexp">解析：${fmt(q.explanation)}</div>` : ''}
  </div>`;
}
function answerText(q){ return q.type === 'tf' ? (/^(O|○|是|對|T)/i.test(q.answer) ? '○' : '✕') : q.answer; }
function optionsHTML(opts){
  const plain = opts.map(o => o.replace(/\$[^$]*\$/g, 'xx'));
  const longest = Math.max(...plain.map(o => o.length));
  const cls = longest > 22 ? 'c1' : longest > 9 ? 'c2' : '';
  return `<div class="opts ${cls}">${opts.map((o, i) => `<span>(${LETTERS[i]}) ${fmt(o)}</span>`).join('')}</div>`;
}
function renderBank(){
  bankFilters();
  const list = bankResult();
  const pages = Math.ceil(list.length / PAGE);
  if(bankPage >= pages) bankPage = Math.max(0, pages - 1);
  $('#bankCount').textContent = `符合 ${list.length} 題（全部 ${DB.questions.length} 題）`;
  const el = $('#bankList');
  el.innerHTML = list.slice(bankPage * PAGE, (bankPage + 1) * PAGE).map(q => qCardHTML(q, true)).join('') || '<div class="card muted">沒有符合的題目</div>';
  renderMath(el);
  $('#bankPager').innerHTML = pages > 1 ? Array.from({ length: pages }, (_, i) => `<button class="${i === bankPage ? 'on' : ''}" data-p="${i}">${i + 1}</button>`).join('') : '';
  $$('#bankPager button').forEach(b => b.onclick = () => { bankPage = +b.dataset.p; renderBank(); window.scrollTo(0, 0); });
  $$('#bankList [data-edit]').forEach(b => b.onclick = () => editQ(b.dataset.edit));
  $$('#bankList [data-del]').forEach(b => b.onclick = () => {
    if(!confirm('刪除這一題？')) return;
    DB.questions = DB.questions.filter(q => q.id !== b.dataset.del); saveDB(); renderBank();
  });
}
['#fSubject', '#fTerm', '#fUnit', '#fType', '#fDiff', '#fSchool'].forEach(s => $(s).onchange = () => { bankPage = 0; renderBank(); });
$('#fKey').oninput = () => { bankPage = 0; clearTimeout(renderBank._t); renderBank._t = setTimeout(renderBank, 250); };
$('#btnBankExport').onclick = () => download(`題目_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(bankResult(), null, 1));
$('#btnBankDelete').onclick = () => {
  const ids = new Set(bankResult().map(q => q.id));
  if(!ids.size || !confirm(`確定刪除目前篩選出的 ${ids.size} 題？此動作無法復原。`)) return;
  DB.questions = DB.questions.filter(q => !ids.has(q.id)); saveDB(); renderBank(); toast(`已刪除 ${ids.size} 題`);
};

/* ─────────────── 逐題新增／編輯 ─────────────── */
let editingId = null;
function initAddForm(){
  fillSelect('#qSubject', window.SUBJECTS); fillSelect('#qTerm', window.TERMS);
  fillSelect('#qType', Object.entries(window.QTYPES).map(([v, o]) => ({ v, t: o.name })));
  fillSelect('#qExam', window.EXAM_KINDS);
  fillSelect('#tSubject', window.SUBJECTS); fillSelect('#tTerm', window.TERMS); fillSelect('#tExam', window.EXAM_KINDS);
  $('#schoolList').innerHTML = [...new Set([DB.settings.school, ...schools()])].filter(Boolean).map(s => `<option value="${esc(s)}">`).join('');
  if(!$('#qSchool').value) $('#qSchool').value = DB.settings.school || '';
  if(!$('#tSchool').value) $('#tSchool').value = DB.settings.school || '';
  syncUnits('#qSubject', '#qTerm', '#qUnit'); syncUnits('#tSubject', '#tTerm', '#tUnit');
}
function syncUnits(sSel, tSel, uSel){ fillSelect(uSel, units($(sSel).value, $(tSel).value), '（未分單元）'); }
['#qSubject', '#qTerm'].forEach(s => $(s).addEventListener('change', () => syncUnits('#qSubject', '#qTerm', '#qUnit')));
['#tSubject', '#tTerm'].forEach(s => $(s).addEventListener('change', () => syncUnits('#tSubject', '#tTerm', '#tUnit')));
function formQ(){
  return normalizeQ({
    id: editingId || undefined,
    subject: $('#qSubject').value, term: $('#qTerm').value, unit: $('#qUnit').value, type: $('#qType').value,
    difficulty: $('#qDiff').value, stem: $('#qStem').value, options: $('#qOpts').value.split('\n').map(s => s.replace(/^\s*[(（]?[A-E][)）.．、]\s*/, '')),
    answer: $('#qAns').value, explanation: $('#qExp').value, tags: $('#qTags').value,
    source: { school: $('#qSchool').value.trim(), year: $('#qYear').value.trim(), exam: $('#qExam').value }
  });
}
function updatePreview(){
  const needOpts = ['single', 'multi'].includes($('#qType').value);
  $('#wrapOpts').style.display = needOpts ? '' : 'none';
  const q = formQ(); if(!needOpts) q.options = [];
  $('#qPreview').innerHTML = q.stem ? qCardHTML(q, false) : '<span class="muted">輸入題目後會在這裡顯示</span>';
  renderMath($('#qPreview'));
}
['#qStem', '#qOpts', '#qAns', '#qExp', '#qType', '#qTags'].forEach(s => $(s).addEventListener('input', () => { clearTimeout(updatePreview._t); updatePreview._t = setTimeout(updatePreview, 300); }));
function saveFormQ(keepUnit){
  const q = formQ();
  if(!['single', 'multi'].includes(q.type)) q.options = [];
  if(!q.stem) return alert('請輸入題目內容');
  if(['single', 'multi'].includes(q.type) && q.options.length < 2) return alert('選擇題至少需要 2 個選項');
  if(!q.answer) return alert('請輸入答案');
  q.answer = ['single', 'multi'].includes(q.type) ? q.answer.toUpperCase().replace(/[^A-E]/g, '') : q.answer;
  if(editingId){
    const i = DB.questions.findIndex(x => x.id === editingId);
    q.used = DB.questions[i].used; q.createdAt = DB.questions[i].createdAt;
    DB.questions[i] = q; saveDB(); toast('已更新');
    cancelEdit(); showTab('bank'); return;
  }
  const r = addQuestions([q]);
  if(!r.added) return alert('題庫已有相同題目，未重複新增');
  toast(`已新增（共 ${DB.questions.length} 題）`);
  ['#qStem', '#qOpts', '#qAns', '#qExp'].forEach(s => $(s).value = '');
  if(!keepUnit) $('#qTags').value = '';
  updatePreview(); $('#qStem').focus();
}
$('#btnSaveQ').onclick = () => saveFormQ(false);
$('#btnSaveNext').onclick = () => saveFormQ(true);
function editQ(id){
  const q = DB.questions.find(x => x.id === id); if(!q) return;
  editingId = id; showTab('add'); $$('.subtabs button')[0].click(); initAddForm();
  $('#qSubject').value = q.subject; $('#qTerm').value = q.term; syncUnits('#qSubject', '#qTerm', '#qUnit');
  if(q.unit && ![...$('#qUnit').options].some(o => o.value === q.unit)) $('#qUnit').insertAdjacentHTML('beforeend', `<option>${esc(q.unit)}</option>`);
  $('#qUnit').value = q.unit; $('#qType').value = q.type; $('#qDiff').value = q.difficulty;
  $('#qStem').value = q.stem; $('#qOpts').value = q.options.join('\n'); $('#qAns').value = q.answer; $('#qExp').value = q.explanation;
  $('#qTags').value = q.tags.join(', '); $('#qSchool').value = q.source.school; $('#qYear').value = q.source.year;
  if(q.source.exam && ![...$('#qExam').options].some(o => o.value === q.source.exam)) $('#qExam').insertAdjacentHTML('beforeend', `<option>${esc(q.source.exam)}</option>`);
  $('#qExam').value = q.source.exam || window.EXAM_KINDS[0];
  $('#formTitle').textContent = '編輯題目'; $('#btnCancelEdit').hidden = false; $('#btnSaveNext').hidden = true;
  updatePreview(); window.scrollTo(0, 0);
}
function cancelEdit(){
  editingId = null; $('#formTitle').textContent = '新增題目'; $('#btnCancelEdit').hidden = true; $('#btnSaveNext').hidden = false;
  ['#qStem', '#qOpts', '#qAns', '#qExp', '#qTags'].forEach(s => $(s).value = ''); updatePreview();
}
$('#btnCancelEdit').onclick = cancelEdit;

/* ─────────────── 貼上文字批次匯入 ─────────────── */
const TYPE_ALIAS = { '單選': 'single', '選擇': 'single', '多選': 'multi', '是非': 'tf', '填充': 'fill', '填空': 'fill', '問答': 'short', '簡答': 'short', '計算': 'calc', '證明': 'calc', '題組': 'read', '閱讀': 'read' };
function parseDiff(s){ s = s.trim(); return /易|1/.test(s) ? 1 : /難|3/.test(s) ? 3 : 2; }
function matchUnit(subject, term, text){
  const us = units(subject, term); text = text.trim();
  return us.find(u => u === text) || us.find(u => u.includes(text) || text.includes(u)) || text;
}
function parseText(text, def){
  const blocks = text.replace(/\r/g, '').split(/\n\s*\n+/).map(b => b.trim()).filter(Boolean);
  const out = [];
  blocks.forEach(block => {
    const q = { subject: def.subject, term: def.term, unit: def.unit, difficulty: def.difficulty, type: '', stem: '', options: [], answer: '', explanation: '', tags: [], source: { ...def.source } };
    const stem = []; let lastField = null;
    block.split('\n').forEach((line, idx) => {
      const L = line.trim(); let m;
      if((m = L.match(/^(答案|答|Ans(?:wer)?)\s*[:：]\s*(.*)$/i))){ q.answer = m[2]; lastField = 'answer'; return; }
      if((m = L.match(/^(解析|詳解|說明)\s*[:：]\s*(.*)$/))){ q.explanation = m[2]; lastField = 'explanation'; return; }
      if((m = L.match(/^題型\s*[:：]\s*(.*)$/))){ q.type = TYPE_ALIAS[Object.keys(TYPE_ALIAS).find(k => m[1].includes(k))] || ''; return; }
      if((m = L.match(/^難度\s*[:：]\s*(.*)$/))){ q.difficulty = parseDiff(m[1]); return; }
      if((m = L.match(/^(學期|年級)\s*[:：]\s*(.*)$/))){ const t = window.TERMS.find(x => m[2].includes(x)); if(t) q.term = t; return; }
      if((m = L.match(/^單元\s*[:：]\s*(.*)$/))){ q.unit = matchUnit(q.subject, q.term, m[1]); return; }
      if((m = L.match(/^(標籤|關鍵字)\s*[:：]\s*(.*)$/))){ q.tags = m[2].split(/[,，、]/).map(s => s.trim()).filter(Boolean); return; }
      if((m = L.match(/^來源\s*[:：]\s*(.*)$/))){ const p = m[1].split(/\s+/); q.source.school = p[0] || q.source.school; if(p[1]) q.source.year = p[1].replace(/學年度?/, ''); if(p[2]) q.source.exam = p.slice(2).join(' '); return; }
      // 選項：同一行可有多個 (A)…(B)…
      if(/^[(（]\s*[A-E]\s*[)）]/.test(L) || /^[A-E][.．、]\s*\S/.test(L) && stem.length){
        const parts = L.split(/[(（]\s*([A-E])\s*[)）]|(?:^|\s)([A-E])[.．、]/).filter(x => x !== undefined);
        let cur = null;
        parts.forEach(p => { if(/^[A-E]$/.test(p)) cur = p; else if(cur && p.trim()){ q.options[LETTERS.indexOf(cur)] = p.trim(); cur = null; } });
        lastField = null; return;
      }
      if(lastField && L){ q[lastField] += '\n' + L; return; }
      stem.push(idx === 0 ? L.replace(/^(第?\s*\d+\s*[.．、)）題]|[(（]\s*\d+\s*[)）])\s*/, '') : L);
    });
    q.stem = stem.join('\n').replace(/^[(（]\s*[)）]\s*/, '').trim();
    q.options = q.options.filter(Boolean);
    q.answer = q.answer.trim();
    if(!q.type){
      if(q.options.length >= 2) q.type = q.answer.replace(/[^A-E]/gi, '').length > 1 ? 'multi' : 'single';
      else if(/^(O|X|○|×|✕|是|非|對|錯)$/i.test(q.answer)) q.type = 'tf';
      else if(/_{3,}|（\s*）|\(\s*\)/.test(q.stem)) q.type = 'fill';
      else q.type = q.answer.length > 30 ? 'short' : 'calc';
    }
    if(['single', 'multi'].includes(q.type)) q.answer = q.answer.toUpperCase().replace(/[^A-E]/g, '');
    if(q.type === 'tf') q.answer = /^(O|○|是|對|T)/i.test(q.answer) ? 'O' : 'X';
    if(q.stem) out.push(q);
  });
  return out;
}
let parsed = [];
$('#btnParse').onclick = () => {
  parsed = parseText($('#tText').value, {
    subject: $('#tSubject').value, term: $('#tTerm').value, unit: $('#tUnit').value, difficulty: +$('#tDiff').value,
    source: { school: $('#tSchool').value.trim(), year: $('#tYear').value.trim(), exam: $('#tExam').value }
  });
  const warn = parsed.filter(q => !q.answer).length;
  const el = $('#parseResult');
  el.innerHTML = `<div class="${warn ? 'msg-warn' : 'msg-ok'}">解析出 ${parsed.length} 題${warn ? `，其中 ${warn} 題沒有答案（仍可匯入，之後再補）` : ''}。請確認下方預覽後按「確認匯入」。</div>` +
    parsed.map(q => qCardHTML(normalizeQ(q), false)).join('');
  renderMath(el);
  $('#btnImportText').disabled = !parsed.length;
};
$('#btnImportText').onclick = () => {
  const r = addQuestions(parsed);
  toast(`匯入 ${r.added} 題${r.dup ? `，略過重複 ${r.dup} 題` : ''}`);
  parsed = []; $('#btnImportText').disabled = true; $('#parseResult').innerHTML = ''; $('#tText').value = '';
};

/* ─────────────── CSV 匯入 ─────────────── */
const CSV_COLS = ['科目', '學期', '單元', '題型', '難度', '題目', '選項A', '選項B', '選項C', '選項D', '選項E', '答案', '解析', '學校', '學年度', '考試別', '標籤'];
function parseCSV(text){
  const rows = []; let row = [], cell = '', q = false;
  text = text.replace(/^﻿/, '');
  for(let i = 0; i < text.length; i++){
    const c = text[i];
    if(q){ if(c === '"'){ if(text[i + 1] === '"'){ cell += '"'; i++; } else q = false; } else cell += c; }
    else if(c === '"') q = true;
    else if(c === ','){ row.push(cell); cell = ''; }
    else if(c === '\n' || c === '\r'){ if(c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if(cell || row.length){ row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}
const csvCell = v => /[",\n]/.test(v) ? '"' + String(v).replace(/"/g, '""') + '"' : v;
$('#btnCsvTpl').onclick = () => {
  const sample = ['數學', '8上', '畢氏定理', '單選', '中', '直角三角形兩股長為 6 與 8，斜邊長為何？', '10', '12', '14', '48', '', 'A', '√(36+64)=10', DB.settings.school || '高雄市立陽明國民中學', '113', '第一次段考', '畢氏定理'];
  download('題庫匯入範本.csv', '﻿' + [CSV_COLS, sample].map(r => r.map(csvCell).join(',')).join('\r\n'), 'text/csv');
};
$('#fileCsv').onchange = async e => {
  const f = e.target.files[0]; if(!f) return;
  const rows = parseCSV(await readFile(f));
  const head = rows.shift().map(h => h.trim());
  const col = name => head.indexOf(name);
  const list = rows.map(r => {
    const g = n => (col(n) >= 0 ? r[col(n)] || '' : '').trim();
    const subject = g('科目'), term = g('學期');
    const type = window.QTYPES[g('題型')] ? g('題型') : TYPE_ALIAS[Object.keys(TYPE_ALIAS).find(k => g('題型').includes(k))] || (g('選項A') ? 'single' : 'fill');
    return {
      subject, term, unit: matchUnit(subject, term, g('單元')), type, difficulty: parseDiff(g('難度') || '中'),
      stem: g('題目'), options: ['選項A', '選項B', '選項C', '選項D', '選項E'].map(g).filter(Boolean),
      answer: type === 'tf' ? (/^(O|○|是|對|T)/i.test(g('答案')) ? 'O' : 'X') : ['single', 'multi'].includes(type) ? g('答案').toUpperCase().replace(/[^A-E]/g, '') : g('答案'),
      explanation: g('解析'), tags: g('標籤'), source: { school: g('學校'), year: g('學年度'), exam: g('考試別') }
    };
  }).filter(q => q.stem && window.SUBJECTS.includes(q.subject) && window.TERMS.includes(q.term));
  const r = addQuestions(list);
  $('#csvResult').innerHTML = `<div class="msg-ok">讀到 ${rows.length} 列，成功匯入 ${r.added} 題，略過重複 ${r.dup} 題${rows.length - list.length ? `，${rows.length - list.length} 列因科目／學期／題目不完整而略過` : ''}。</div>`;
  e.target.value = '';
};

/* ─────────────── 組卷 ─────────────── */
const DEFAULT_COUNTS = { exam: { single: [20, 3], multi: [0, 4], tf: [0, 2], fill: [5, 4], short: [0, 5], calc: [2, 5], read: [0, 4] },
                         work: { single: [10, 0], multi: [0, 0], tf: [5, 0], fill: [8, 0], short: [2, 0], calc: [3, 0], read: [0, 0] } };
function renderGenForm(){
  fillSelect('#gSubject', window.SUBJECTS);
  const terms = window.TERMS;
  if(!$('#gTerms').children.length){
    $('#gTerms').innerHTML = terms.map(t => `<label><input type="checkbox" value="${t}"> ${t}</label>`).join('');
    $$('#gTerms input').forEach(i => i.onchange = renderGenUnits);
    $('#gTerms input').checked = true;
  }
  const scs = schools();
  fillSelect('#gSource', [{ v: '', t: '全部來源' }, ...scs.map(s => ({ v: 'prefer:' + s, t: '優先：' + s })), ...scs.map(s => ({ v: 'only:' + s, t: '只用：' + s }))]);
  if(!renderGenForm._init){
    const main = DB.settings.school;
    if(main && scs.includes(main)) $('#gSource').value = 'prefer:' + main;
    renderGenForm._init = true;
  }
  if(!$('#gSeed').value) $('#gSeed').value = Math.random().toString(36).slice(2, 8);
  renderGenUnits();
}
function genTerms(){ return $$('#gTerms input:checked').map(i => i.value); }
function renderGenUnits(){
  const s = $('#gSubject').value;
  const prev = new Set($$('#gUnits input:checked').map(i => i.value));
  const known = new Set($$('#gUnits input').map(i => i.value));
  const first = !$('#gUnits').children.length || renderGenUnits._subj !== s;
  renderGenUnits._subj = s;
  const items = [];
  genTerms().forEach(t => {
    const us = [...units(s, t)];
    DB.questions.forEach(q => { if(q.subject === s && q.term === t && !us.includes(q.unit)) us.push(q.unit); });
    us.forEach(u => {
      const n = DB.questions.filter(q => q.subject === s && q.term === t && q.unit === u).length;
      const v = t + '|' + u;
      items.push(`<label><input type="checkbox" value="${esc(v)}" ${first || prev.has(v) || !known.has(v) ? 'checked' : ''}> ${t}・${esc(u || '未分單元')} <span class="cnt">(${n})</span></label>`);
    });
  });
  $('#gUnits').innerHTML = items.join('') || '<span class="muted">請先勾選學期</span>';
  $$('#gUnits input').forEach(i => i.onchange = renderGenTypes);
  renderGenTypes();
}
function genPool(){
  const s = $('#gSubject').value;
  const sel = new Set($$('#gUnits input:checked').map(i => i.value));
  const src = $('#gSource').value;
  return DB.questions.filter(q => q.subject === s && sel.has(q.term + '|' + q.unit) && (!src.startsWith('only:') || q.source.school === src.slice(5)));
}
function renderGenTypes(){
  const pool = genPool(), mode = $('#gMode').value;
  const old = {}; $$('#gTypes tbody tr').forEach(tr => old[tr.dataset.t] = [tr.querySelector('.n').value, tr.querySelector('.p').value]);
  const modeChanged = renderGenTypes._mode !== mode; renderGenTypes._mode = mode;
  $('#gTypes tbody').innerHTML = Object.entries(window.QTYPES).map(([t, o]) => {
    const avail = pool.filter(q => q.type === t).length;
    const [n, p] = !modeChanged && old[t] ? old[t] : DEFAULT_COUNTS[mode][t];
    return `<tr data-t="${t}"><td>${o.name}</td><td>${avail}</td><td><input class="n" type="number" min="0" value="${n}"></td><td><input class="p" type="number" min="0" step="0.5" value="${p}" ${mode === 'work' ? 'disabled' : ''}></td></tr>`;
  }).join('');
}
['#gSubject'].forEach(s => $(s).onchange = renderGenUnits);
$('#gMode').onchange = renderGenTypes;
$('#gSource').onchange = renderGenTypes;
$('#gUnitAll').onclick = e => { e.preventDefault(); $$('#gUnits input').forEach(i => i.checked = true); renderGenTypes(); };
$('#gUnitNone').onclick = e => { e.preventDefault(); $$('#gUnits input').forEach(i => i.checked = false); renderGenTypes(); };

// 依學期→單元順序排列，難度由易到難
const unitOrder = q => window.TERMS.indexOf(q.term) * 1000 + Math.max(0, units(q.subject, q.term).indexOf(q.unit)) * 10;
const order = q => unitOrder(q) + q.difficulty;
// 習作：依單元分組，組內依題型、難度排列
function workSequence(picked){
  const typeOrder = Object.keys(window.QTYPES);
  return Object.values(picked).flat().sort((a, b) => unitOrder(a) - unitOrder(b) || (a.term + a.unit).localeCompare(b.term + b.unit) ||
    typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type) || a.difficulty - b.difficulty);
}
function pickQuestions(cfg){
  const rand = rng(cfg.seed);
  const pool = genPool();
  const prefer = cfg.source.startsWith('prefer:') ? cfg.source.slice(7) : null;
  const picked = {}; const warns = [];
  const dsum = cfg.diff.reduce((a, b) => a + b, 0) || 1;
  Object.entries(cfg.counts).forEach(([type, { n }]) => {
    if(!n) return;
    const cand = pool.filter(q => q.type === type).map(q => ({
      q, score: rand() + (prefer && q.source.school === prefer ? -0.7 : 0) + (cfg.avoid ? Math.min(q.used, 5) * 0.25 : 0)
    })).sort((a, b) => a.score - b.score).map(x => x.q);
    if(cand.length < n) warns.push(`${window.QTYPES[type].name}只有 ${cand.length} 題可用（需要 ${n} 題）`);
    const quota = { 1: Math.round(n * cfg.diff[0] / dsum), 2: Math.round(n * cfg.diff[1] / dsum) };
    quota[3] = Math.max(0, n - quota[1] - quota[2]);
    const unitCnt = {}; const unitsAvail = new Set(cand.map(q => q.term + q.unit));
    const cap = Math.ceil(n / Math.max(1, unitsAvail.size));
    const chosen = [], used = new Set();
    const take = cond => { for(const q of cand){ if(chosen.length >= n) return; if(used.has(q.id) || !cond(q)) continue; chosen.push(q); used.add(q.id); quota[q.difficulty]--; unitCnt[q.term + q.unit] = (unitCnt[q.term + q.unit] || 0) + 1; } };
    take(q => quota[q.difficulty] > 0 && (unitCnt[q.term + q.unit] || 0) < cap); // 難度配比＋單元平均
    take(q => quota[q.difficulty] > 0);                                         // 放寬單元
    take(() => true);                                                           // 題數不足時補滿
    picked[type] = chosen.sort((a, b) => order(a) - order(b)).map(q => {
      if(!cfg.shuffleOpt || !['single', 'multi'].includes(q.type) || q.options.some(o => /以上|皆非|皆是|都對|都錯/.test(o))) return q;
      const idx = shuffle(q.options.map((_, i) => i), rand);
      return { ...q, options: idx.map(i => q.options[i]), answer: [...q.answer].map(ch => LETTERS[idx.indexOf(LETTERS.indexOf(ch))]).sort().join('') };
    });
  });
  return { picked, warns };
}
function genConfig(){
  const counts = {};
  $$('#gTypes tbody tr').forEach(tr => counts[tr.dataset.t] = { n: Math.max(0, +tr.querySelector('.n').value || 0), p: +tr.querySelector('.p').value || 0 });
  return {
    title: $('#gTitle').value.trim() || `${$('#gSubject').value}複習${$('#gMode').value === 'work' ? '學習單' : '卷'}`,
    subject: $('#gSubject').value, mode: $('#gMode').value, terms: genTerms(),
    units: $$('#gUnits input:checked').map(i => i.value), counts,
    diff: [+$('#gD1').value || 0, +$('#gD2').value || 0, +$('#gD3').value || 0],
    source: $('#gSource').value, avoid: $('#gAvoid').checked, shuffleOpt: $('#gShuffleOpt').checked, expl: $('#gExpl').checked,
    seed: $('#gSeed').value.trim() || 'seed'
  };
}
let current = null;
function generate(){
  const cfg = genConfig();
  if(!cfg.units.length) return alert('請至少勾選一個單元');
  const { picked, warns } = pickQuestions(cfg);
  const total = Object.values(picked).reduce((a, l) => a + l.length, 0);
  if(!total){ $('#genMsg').innerHTML = '<div class="msg-warn">選取範圍內沒有可用的題目，請放寬範圍或先匯入題目。</div>'; $('#paperArea').innerHTML = ''; return; }
  current = { cfg, picked };
  $('#genMsg').innerHTML = (warns.length ? `<div class="msg-warn">⚠ ${warns.join('；')}</div>` : '') + `<div class="msg-ok">已抽出 ${total} 題（亂數種子：${esc(cfg.seed)}，輸入同一個種子可重現同一份卷子）</div>`;
  renderPaper();
  ['#btnPrintPaper', '#btnPrintKey', '#btnSavePaper'].forEach(s => $(s).disabled = false);
}
$('#btnGen').onclick = generate;
$('#btnRegen').onclick = () => { $('#gSeed').value = Math.random().toString(36).slice(2, 8); generate(); };

const CN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
const SPACE = { fill: 0, short: 5, calc: 8, read: 4 };
const WORK_SPACE = { single: 0, multi: 0, tf: 0, fill: 0, short: 5, calc: 8, read: 4 };
function paperHead(cfg, isKey){
  const school = DB.settings.header || DB.settings.school || '';
  const range = cfg.terms.join('、');
  const totalPts = cfg.mode === 'exam' ? Object.entries(current.picked).reduce((a, [t, l]) => a + l.length * cfg.counts[t].p, 0) : 0;
  return `<h1>${esc(school)}　${esc(cfg.title)}${isKey ? '【答案卷】' : ''}</h1>
    <div class="sub-t">科目：${esc(cfg.subject)}　範圍：${esc(range)}${totalPts ? `　滿分：${+totalPts.toFixed(1)} 分` : ''}</div>
    ${isKey ? '' : `<div class="stu"><span>____年____班</span><span>座號：______</span><span>姓名：____________</span><span>${cfg.mode === 'exam' ? '得分：______' : '完成日期：______'}</span></div>`}`;
}
function pqHTML(q, no, mode){
  const isChoice = ['single', 'multi', 'tf'].includes(q.type);
  const lead = isChoice ? `<span class="paren">(　　)</span>` : '';
  const space = (mode === 'work' ? WORK_SPACE : SPACE)[q.type] || 0;
  const src = q.source.school && q.source.school !== '平台範例' ? `<span class="src">［${esc([q.source.school.replace(/^高雄市立/, ''), q.source.year, q.source.exam].filter(Boolean).join(' '))}］</span>` : '';
  return `<div class="pq"><span class="no">${lead}${no}.</span><div class="bd">${fmt(q.stem)}${src}${q.options.length ? optionsHTML(q.options) : ''}${space ? `<div class="space" style="height:${space * 1.6}em"></div>` : ''}</div></div>`;
}
function renderPaper(){
  const { cfg, picked } = current;
  let html = `<div class="paper exam">${paperHead(cfg, false)}`;
  let no = 0;
  if(cfg.mode === 'exam'){
    Object.entries(picked).filter(([, l]) => l.length).forEach(([t, list], si) => {
      const p = cfg.counts[t].p;
      html += `<div class="sec">${CN_NUM[si]}、${window.QTYPES[t].name}（${p ? `每題 ${p} 分，共 ${+(p * list.length).toFixed(1)} 分` : '共 ' + list.length + ' 題'}）${t === 'multi' ? '　※ 每題至少有一個正確選項' : ''}</div>`;
      list.forEach(q => html += pqHTML(q, ++no, 'exam'));
    });
  }else{
    // 習作：依單元分組，每單元先寫重點回顧，再做練習
    const byUnit = new Map();
    workSequence(picked).forEach(q => { const u = q.term + '・' + (q.unit || '未分單元'); if(!byUnit.has(u)) byUnit.set(u, []); byUnit.get(u).push(q); });
    byUnit.forEach((list, u) => {
      const tags = [...new Set(list.flatMap(q => q.tags))].slice(0, 8);
      html += `<div class="unit-h">${esc(u)}</div>
        <div class="recall"><b>重點回顧</b>${tags.length ? `（關鍵概念：${tags.map(esc).join('、')}）` : ''}<div class="ln"></div><div class="ln"></div></div>`;
      list.forEach(q => html += pqHTML(q, ++no, 'work'));
      html += `<div class="recall"><b>我的錯題／疑問</b><div class="ln"></div></div>`;
    });
  }
  html += `<div class="foot">— 試題結束 —</div></div>`;

  // 答案卷
  no = 0;
  let key = `<div class="paper key">${paperHead(cfg, true)}<table class="key-tbl">`;
  const seq = cfg.mode === 'exam' ? Object.values(picked).flat() : workSequence(picked);
  seq.forEach(q => {
    key += `<tr><td style="width:3em">${++no}</td><td style="width:8em"><b>${fmt(answerText(q))}</b></td><td>${cfg.expl && q.explanation ? fmt(q.explanation) : ''}<span class="src">${esc(q.unit)}</span></td></tr>`;
  });
  key += `</table></div>`;
  $('#paperArea').innerHTML = html + key;
  renderMath($('#paperArea'));
}
function printMode(cls){ document.body.classList.add(cls); window.print(); setTimeout(() => document.body.classList.remove(cls), 500); }
$('#btnPrintPaper').onclick = () => printMode('print-paper');
$('#btnPrintKey').onclick = () => printMode('print-key');
$('#btnSavePaper').onclick = () => {
  if(!current) return;
  const ids = Object.values(current.picked).flat().map(q => q.id);
  ids.forEach(id => { const q = DB.questions.find(x => x.id === id); if(q) q.used++; });
  DB.papers.push({ id: uid(), title: current.cfg.title, date: new Date().toISOString(), cfg: current.cfg, picked: Object.fromEntries(Object.entries(current.picked).map(([t, l]) => [t, l.map(q => ({ id: q.id, options: q.options, answer: q.answer }))])) });
  saveDB(); toast('已儲存，題目出題次數已更新'); $('#btnSavePaper').disabled = true;
};
function reopenPaper(id){
  const p = DB.papers.find(x => x.id === id); if(!p) return;
  const picked = {};
  Object.entries(p.picked).forEach(([t, l]) => picked[t] = l.map(r => { const q = DB.questions.find(x => x.id === r.id); return q && { ...q, options: r.options, answer: r.answer }; }).filter(Boolean));
  current = { cfg: p.cfg, picked };
  showTab('gen'); renderPaper();
  $('#genMsg').innerHTML = `<div class="msg-ok">已重新開啟「${esc(p.title)}」（${p.date.slice(0, 10)}）</div>`;
  ['#btnPrintPaper', '#btnPrintKey'].forEach(s => $(s).disabled = false);
}

/* ─────────────── 課程架構 ─────────────── */
function renderCurr(){
  fillSelect('#cSubject', window.SUBJECTS); fillSelect('#cTerm', window.TERMS);
  $('#cUnits').value = units($('#cSubject').value, $('#cTerm').value).join('\n');
  const s = $('#cSubject').value, t = $('#cTerm').value;
  const rows = units(s, t).map(u => [u, DB.questions.filter(q => q.subject === s && q.term === t && q.unit === u).length]);
  $('#currStats').innerHTML = '<div class="label" style="margin-top:12px">各單元題數</div>';
  const d = document.createElement('div'); $('#currStats').appendChild(d); d.id = 'currBars'; bars('#currBars', rows);
}
$('#cSubject').onchange = renderCurr; $('#cTerm').onchange = renderCurr;
$('#btnSaveCurr').onclick = () => {
  const s = $('#cSubject').value, t = $('#cTerm').value;
  const old = units(s, t), neu = $('#cUnits').value.split('\n').map(x => x.trim()).filter(Boolean);
  let renamed = 0;
  for(let i = 0; i < Math.min(old.length, neu.length); i++){
    if(old[i] !== neu[i] && !neu.includes(old[i])) DB.questions.forEach(q => { if(q.subject === s && q.term === t && q.unit === old[i]){ q.unit = neu[i]; renamed++; } });
  }
  DB.curriculum[s] = DB.curriculum[s] || {}; DB.curriculum[s][t] = neu;
  saveDB(); renderCurr(); toast(`已儲存${renamed ? `，${renamed} 題跟著改名` : ''}`);
};
$('#btnResetCurr').onclick = () => {
  const s = $('#cSubject').value, t = $('#cTerm').value;
  $('#cUnits').value = (window.DEFAULT_CURRICULUM[s] || {})[t]?.join('\n') || '';
  toast('已載入預設，按「儲存單元」才會生效');
};

/* ─────────────── 蒐集進度 ─────────────── */
function renderCoverage(){
  const scs = [...new Set([DB.settings.school, ...schools()])].filter(Boolean);
  fillSelect('#covSchool', scs); fillSelect('#covTerm', window.TERMS, '全部學期');
  const sc = $('#covSchool').value, tm = $('#covTerm').value;
  const qs = DB.questions.filter(q => q.source.school === sc && (!tm || q.term === tm));
  const years = [...new Set(qs.map(q => q.source.year).filter(Boolean))].sort().reverse();
  const thisYear = new Date().getFullYear() - 1911 - (new Date().getMonth() < 7 ? 1 : 0);
  for(let y = thisYear; y > thisYear - 5; y--) if(!years.includes(String(y))) years.push(String(y));
  years.sort((a, b) => b - a);
  const exams = ['第一次段考', '第二次段考', '第三次段考', '期末考', '模擬考', '複習考'];
  let html = `<table class="tbl cov"><thead><tr><th>學年度</th><th>考試別</th>${window.SUBJECTS.map(s => `<th>${s}</th>`).join('')}</tr></thead><tbody>`;
  years.forEach(y => exams.forEach((ex, i) => {
    html += `<tr><td>${i === 0 ? y : ''}</td><td>${ex}</td>${window.SUBJECTS.map(s => {
      const n = qs.filter(q => q.source.year === y && q.source.exam === ex && q.subject === s).length;
      return `<td class="${n ? 'has' : 'none'}">${n || '·'}</td>`;
    }).join('')}</tr>`;
  }));
  html += '</tbody></table>';
  const noYear = qs.filter(q => !q.source.year).length;
  $('#coverage').innerHTML = sc ? html + (noYear ? `<div class="muted">另有 ${noYear} 題未填學年度</div>` : '') : '<div class="muted">尚無資料</div>';
}
$('#covSchool').onchange = renderCoverage; $('#covTerm').onchange = renderCoverage;

/* ─────────────── 啟動 ─────────────── */
loadDB();
initAddForm();
updatePreview();
renderDash();
// KaTeX 以 defer 載入，載入後重新排版目前畫面
window.addEventListener('load', () => $$('.tab.on').forEach(renderMath));
