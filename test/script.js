// 台本 (scripts): lines of dialogue per character, kept in the cloud next to the memo.
// Stored as meta/people { list: [{id, name, color}] } and meta/script_<id> { kind, title, lines: [{id, who, text}], createdAt, deleted }.
// who is a person id, or "note" for ト書き (scene and BGM notes).
import { enableDrag } from './drag.js';

export const PERSON_COLORS = [['赤', '#D9534F'], ['山吹', '#D9A72E'], ['そら', '#6FA8C9'], ['わかば', '#7DB58F'], ['ふじ', '#A58BD1'], ['さくら', '#E88FA8'], ['コーラル', '#E07A5F'], ['こげ茶', '#8A766B']];
const NOTE = 'note', NOTE_COLOR = '#B5A398';
const CHARS_PER_MINUTE = 300;

export function initScripts({ $, esc, put, meta, view, remember, confirmBox, newId, nowIso, afterAdd = () => { } }) {
  let editingLine = null, undo = null, toastTimer = null;

  const people = () => meta().get('people')?.list ?? [];
  const person = id => people().find(p => p.id === id);
  const scripts = () => [...meta().values()].filter(d => d.id?.startsWith('script_') && d.kind === 'script' && !d.deleted)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  const current = () => scripts().find(s => s.id === view.script) ?? scripts().at(-1) ?? null;
  const nameOf = who => who === NOTE ? 'ト書き' : person(who)?.name ?? '（削除した人物）';
  const colorOf = who => who === NOTE ? NOTE_COLOR : person(who)?.color ?? NOTE_COLOR;
  const saveLines = (script, lines) => put('meta', script.id, { kind: 'script', title: script.title, lines, createdAt: script.createdAt, deleted: false });
  const savePeople = list => put('meta', 'people', { list });

  // ---- rendering ----
  function render() {
    if (lineDrag.busy) { renderLater = true; return; }
    const list = scripts(), script = current();
    if (script && view.script !== script.id) { view.script = script.id; remember(); }
    $('scriptSelect').innerHTML = list.length
      ? list.map(s => `<option value="${esc(s.id)}">${esc(s.title || '無題の台本')}</option>`).join('')
      : '<option value="">台本はまだありません</option>';
    $('scriptSelect').value = script?.id ?? '';
    $('scriptMore').disabled = !script;
    $('scriptCopy').disabled = !script || !script.lines?.length;
    $('scriptAdd').hidden = !script;
    renderSpeakerChoice();
    const lines = script?.lines ?? [];
    $('scriptLines').innerHTML = lines.map(l => l.who === NOTE
      ? `<li class="sline note" data-id="${esc(l.id)}"><span class="txt">${esc(l.text)}</span></li>`
      : `<li class="sline" data-id="${esc(l.id)}"><b style="color:${esc(shade(colorOf(l.who)))}">${esc(nameOf(l.who))}</b><span class="txt">${esc(l.text)}</span></li>`).join('');
    $('scriptEmpty').hidden = lines.length > 0;
    $('scriptEmpty').textContent = script ? '下の欄からセリフを追加してください' : '「＋新しい台本」から始めましょう';
    renderStats(lines);
  }
  function renderStats(lines) {
    const spoken = lines.filter(l => l.who !== NOTE);
    const chars = spoken.reduce((n, l) => n + [...l.text].length, 0);
    const seconds = Math.round(chars / CHARS_PER_MINUTE * 60);
    $('scriptStats').hidden = spoken.length === 0;
    $('statLines').textContent = spoken.length;
    $('statChars').textContent = chars.toLocaleString();
    $('statTime').textContent = seconds >= 60 ? `約${Math.floor(seconds / 60)}分${seconds % 60}秒` : `約${seconds}秒`;
    const counts = new Map();
    for (const l of spoken) counts.set(l.who, (counts.get(l.who) ?? 0) + 1);
    const max = Math.max(1, ...counts.values());
    $('statBars').innerHTML = [...counts].sort((a, b) => b[1] - a[1]).map(([who, n]) =>
      `<div><span class="nm2">${esc(nameOf(who))}</span><span class="bar"><i style="width:${n / max * 100}%;background:${esc(colorOf(who))}"></i></span><span class="ct">${n}行</span></div>`).join('');
    $('scriptStats').classList.toggle('folded', !!view.statsFolded);
  }
  function renderSpeakerChoice() {
    const choice = $('speaker'), keep = choice.value;
    choice.innerHTML = people().map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('') + `<option value="${NOTE}">ト書き</option>`;
    choice.value = [...choice.options].some(o => o.value === keep) ? keep : (people()[0]?.id ?? NOTE);
    $('speakerWrap').style.setProperty('--c', colorOf(choice.value));
  }
  // Darker version of a person's color, so names stay readable on white.
  function shade(hex) {
    const n = parseInt(hex.slice(1), 16);
    const f = c => Math.round(c * 0.82).toString(16).padStart(2, '0');
    return '#' + f(n >> 16 & 255) + f(n >> 8 & 255) + f(n & 255);
  }

  // ---- adding lines ----
  $('speaker').addEventListener('change', () => $('speakerWrap').style.setProperty('--c', colorOf($('speaker').value)));
  $('scriptAdd').addEventListener('submit', e => {
    e.preventDefault();
    const script = current(), text = $('lineInput').value.trim();
    if (!script || !text) return;
    const who = $('speaker').value || NOTE;
    saveLines(script, [...(script.lines ?? []), { id: newId(), who, text }]);
    $('lineInput').value = '';
    // Two people usually take turns, so the next line starts with the other one.
    const ps = people();
    if (who !== NOTE && ps.length === 2) $('speaker').value = ps.find(p => p.id !== who).id;
    $('speakerWrap').style.setProperty('--c', colorOf($('speaker').value));
    setTimeout(afterAdd, 30);
  });

  // ---- scripts ----
  $('scriptSelect').addEventListener('change', () => { view.script = $('scriptSelect').value; remember(); render(); });
  $('scriptNew').addEventListener('click', () => {
    const n = scripts().length + 1;
    const title = prompt('台本の名前', `第${n}話`);
    if (title === null) return;
    const id = 'script_' + newId();
    view.script = id; remember();
    put('meta', id, { kind: 'script', title: title.trim() || `第${n}話`, lines: [], createdAt: nowIso(), deleted: false });
    render();
  });
  $('scriptMore').addEventListener('click', () => { $('scriptMenuTitle').textContent = current()?.title ?? ''; $('scriptMenu').showModal(); });
  $('scriptRename').addEventListener('click', () => {
    const script = current(); $('scriptMenu').close();
    const title = script && prompt('台本の名前', script.title);
    if (title?.trim()) put('meta', script.id, { title: title.trim() });
  });
  $('scriptDuplicate').addEventListener('click', () => {
    const script = current(); $('scriptMenu').close();
    if (!script) return;
    const id = 'script_' + newId();
    view.script = id; remember();
    put('meta', id, { kind: 'script', title: script.title + 'のコピー', lines: (script.lines ?? []).map(l => ({ ...l, id: newId() })), createdAt: nowIso(), deleted: false });
    render();
  });
  $('scriptDelete').addEventListener('click', async () => {
    const script = current(); $('scriptMenu').close();
    if (!script || !await confirmBox(`台本「${script.title}」を削除しますか？`)) return;
    view.script = ''; remember();
    put('meta', script.id, { deleted: true });
    render();
    toast('台本を削除しました', () => { view.script = script.id; remember(); put('meta', script.id, { deleted: false }); render(); });
  });
  $('statsToggle').addEventListener('click', () => { view.statsFolded = !view.statsFolded; remember(); render(); });

  // ---- editing a line ----
  $('scriptLines').addEventListener('click', e => {
    const li = e.target.closest('.sline');
    const line = li && current()?.lines?.find(l => l.id === li.dataset.id);
    if (!line) return;
    editingLine = line.id;
    $('lineWho').innerHTML = people().map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('') + `<option value="${NOTE}">ト書き</option>`;
    if (![...$('lineWho').options].some(o => o.value === line.who)) $('lineWho').insertAdjacentHTML('afterbegin', `<option value="${esc(line.who)}">${esc(nameOf(line.who))}</option>`);
    $('lineWho').value = line.who;
    $('lineText').value = line.text;
    $('lineSheet').showModal();
    if (line.text === '（新しいセリフ）') $('lineText').select();
  });
  // The lines with the sheet's edit applied (unchanged when nothing was edited).
  function edited(script, id) {
    const text = $('lineText').value.trim(), who = $('lineWho').value;
    return script.lines.map(l => l.id === id && text && (l.text !== text || l.who !== who) ? { ...l, text, who } : l);
  }
  function saveLine() {
    const script = current(), id = editingLine;
    editingLine = null;
    if (!script || !id) return;
    const lines = edited(script, id);
    if (lines.some((l, i) => l !== script.lines[i])) saveLines(script, lines);
  }
  $('lineSheet').querySelector('form').addEventListener('submit', saveLine);
  $('lineSheet').addEventListener('cancel', saveLine);
  $('lineDelete').addEventListener('click', () => {
    const script = current(), id = editingLine;
    editingLine = null; $('lineSheet').close();
    if (!script) return;
    const before = script.lines;
    saveLines(script, before.filter(l => l.id !== id));
    toast('セリフを削除しました', () => saveLines(script, before));
  });
  // Saves this line's edit and puts a new line under it in one write, then opens the new line for typing.
  $('lineInsert').addEventListener('click', () => {
    const script = current(), id = editingLine;
    editingLine = null; $('lineSheet').close();
    if (!script || !id) return;
    const lines = edited(script, id);
    const at = lines.findIndex(l => l.id === id);
    const ps = people(), was = lines[at].who;
    const who = was !== NOTE && ps.length === 2 ? ps.find(p => p.id !== was).id : was;
    const fresh = { id: newId(), who, text: '（新しいセリフ）' };
    lines.splice(at + 1, 0, fresh);
    saveLines(script, lines);
    setTimeout(() => $('scriptLines').querySelector(`[data-id="${CSS.escape(fresh.id)}"]`)?.click(), 80);
  });

  // ---- reorder (long press, like the ToDo list) ----
  let renderLater = false;
  const lineDrag = enableDrag($('scriptLines'), {
    item: '.sline', ignore: 'none',
    enabled: () => true,
    onState: on => { if (!on && renderLater) { renderLater = false; setTimeout(render); } },
    onDrop(id, order) {
      const script = current();
      if (!script) return;
      const byId = new Map(script.lines.map(l => [l.id, l]));
      const lines = order.map(x => byId.get(x)).filter(Boolean);
      if (lines.length === script.lines.length && lines.some((l, i) => l !== script.lines[i])) saveLines(script, lines);
    },
  });

  // ---- copy as text ----
  $('scriptCopy').addEventListener('click', () => { showCopy(); $('copySheet').showModal(); });
  function copyText() {
    const format = view.copyFormat ?? 'colon', notes = view.copyNotes ?? true;
    return (current()?.lines ?? []).filter(l => notes || l.who !== NOTE).map(l => l.who === NOTE ? l.text
      : format === 'tab' ? `${nameOf(l.who)}\t${l.text}` : format === 'text' ? l.text : `${nameOf(l.who)}：${l.text}`).join('\n');
  }
  function showCopy() {
    for (const b of $('copyFormats').children) b.classList.toggle('on', b.dataset.format === (view.copyFormat ?? 'colon'));
    $('copyNotes').checked = view.copyNotes ?? true;
    $('copyPreview').value = copyText();
    $('copyMessage').textContent = '';
  }
  $('copyFormats').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { view.copyFormat = b.dataset.format; remember(); showCopy(); } });
  $('copyNotes').addEventListener('change', () => { view.copyNotes = $('copyNotes').checked; remember(); showCopy(); });
  $('copyButton').addEventListener('click', async () => {
    const text = copyText();
    try { await navigator.clipboard.writeText(text); }
    catch { $('copyPreview').focus(); $('copyPreview').select(); document.execCommand('copy'); }
    $('copyMessage').textContent = 'コピーしました';
  });

  // ---- people (in settings) ----
  function renderPeople() {
    $('personList').innerHTML = people().map(p => `<li data-id="${esc(p.id)}">
      <select class="color" aria-label="色" style="--c:${esc(p.color)}">${PERSON_COLORS.map(([n, v]) => `<option value="${v}" ${v === p.color ? 'selected' : ''}>${n}</option>`).join('')}</select>
      <input class="name" value="${esc(p.name)}" maxlength="20" aria-label="名前">
      <button type="button" class="small danger del">削除</button></li>`).join('') || '<li class="sub">まだいません</li>';
  }
  $('personList').addEventListener('change', e => {
    const li = e.target.closest('li[data-id]');
    if (!li) return;
    const list = people().map(p => p.id !== li.dataset.id ? p
      : e.target.classList.contains('color') ? { ...p, color: e.target.value }
      : e.target.value.trim() ? { ...p, name: e.target.value.trim() } : p);
    savePeople(list);
    if (e.target.classList.contains('color')) e.target.style.setProperty('--c', e.target.value);
  });
  $('personList').addEventListener('click', async e => {
    const li = e.target.closest('li[data-id]');
    if (!li || !e.target.classList.contains('del')) return;
    const p = person(li.dataset.id);
    const used = scripts().reduce((n, s) => n + (s.lines ?? []).filter(l => l.who === p.id).length, 0);
    if (!await confirmBox(`「${p.name}」を削除しますか？` + (used ? `\nこの人物のセリフ${used}行は「削除した人物」と表示されます。` : ''))) return;
    savePeople(people().filter(x => x.id !== p.id));
    setTimeout(renderPeople);
  });
  $('addPerson').addEventListener('click', () => {
    const name = $('personName').value.trim();
    if (!name) return;
    if (people().some(p => p.name === name)) { $('personMessage').textContent = '同じ名前の人物がいます'; return; }
    const used = new Set(people().map(p => p.color));
    const color = PERSON_COLORS.map(c => c[1]).find(c => !used.has(c)) ?? PERSON_COLORS[0][1];
    savePeople([...people(), { id: newId(), name, color }]);
    $('personName').value = ''; $('personMessage').textContent = '';
    setTimeout(renderPeople);
  });

  function toast(text, onUndo) {
    clearTimeout(toastTimer);
    undo = onUndo;
    $('toastText').textContent = text;
    $('toast').hidden = false;
    toastTimer = setTimeout(() => { $('toast').hidden = true; undo = null; }, 5000);
  }
  $('toastUndo').addEventListener('click', () => { undo?.(); undo = null; $('toast').hidden = true; });

  return { render, renderPeople };
}
