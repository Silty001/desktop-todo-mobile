import { firebaseConfig } from './firebase-config.js';
import { createStore } from './store.js';

// Same six colors as the PC app's category palette.
const PALETTE = [['コーラル', '#E07A5F'], ['はちみつ', '#E3B04B'], ['わかば', '#7DB58F'], ['そら', '#6FA8C9'], ['ふじ', '#A58BD1'], ['さくら', '#E88FA8']];
const NO_CATEGORY = '#F5DCCB';
const WEEK = '日月火水木金土';
const $ = id => document.getElementById(id);

let store, user = null, data = { tasks: new Map(), categories: new Map() };
const view = load('desktop-todo-view', { filter: 'open', category: '', byDue: false });
let editing = null, signUpMode = false;

function load(key, fallback) { try { return { ...fallback, ...JSON.parse(localStorage.getItem(key) || '{}') }; } catch { return fallback; } }
function remember() { try { localStorage.setItem('desktop-todo-view', JSON.stringify(view)); } catch { } }
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---- data helpers ----
const tasks = () => [...data.tasks.values()].filter(t => !t.deleted && typeof t.title === 'string');
const categories = () => [...data.categories.values()].filter(c => !c.deleted).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
const category = id => id ? data.categories.get(id) : null;
const put = (name, id, fields) => store.put(user.uid, name, id, fields).catch(showError);
const nowIso = () => new Date().toISOString();
// randomUUID needs https; getRandomValues also works over plain http on the home network.
const newId = () => crypto.randomUUID?.() ?? '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));

function today() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function parseDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function daysLeft(due) { return Math.round((parseDate(due) - today()) / 86400000); }
function dueLabel(t) {
  if (!t.dueDate) return '';
  const d = parseDate(t.dueDate);
  const date = d.getFullYear() === today().getFullYear() ? `${d.getMonth() + 1}/${d.getDate()}` : `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  if (t.completed) return `納期 · ${date}(${WEEK[d.getDay()]})`;
  const n = daysLeft(t.dueDate);
  return `納期 · ${date}(${WEEK[d.getDay()]})` + (n < 0 ? `（${-n}日超過）` : n === 0 ? '（今日まで）' : n === 1 ? '（明日まで）' : `（あと${n}日）`);
}
const totalSeconds = t => (t.timeLog || []).reduce((sum, e) => sum + (e.seconds || 0), 0);
function duration(seconds) {
  const m = Math.floor(seconds / 60);
  return m >= 60 ? `${Math.floor(m / 60)}時間${String(m % 60).padStart(2, '0')}分` : seconds > 0 && m === 0 ? '1分未満' : `${m}分`;
}
function byOrder(a, b) { return (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || String(a.createdAt).localeCompare(String(b.createdAt)); }
function byDue(a, b) { return (a.dueDate ? 0 : 1) - (b.dueDate ? 0 : 1) || String(a.dueDate).localeCompare(String(b.dueDate)) || byOrder(a, b); }

// ---- rendering ----
function render() {
  const all = tasks();
  const open = all.filter(t => !t.completed);
  $('countText').textContent = `未完了 ${open.length}件`;
  for (const b of $('tabs').children) b.classList.toggle('on', b.dataset.filter === view.filter);
  if (view.category && !categories().some(c => c.id === view.category)) view.category = '';
  $('chips').innerHTML = [['', 'すべて', ''], ...categories().map(c => [c.id, c.name, c.color])]
    .map(([id, name, color]) => `<button data-cat="${esc(id)}" class="${view.category === id ? 'on' : ''}">${color ? `<i style="background:${esc(color)}"></i>` : ''}${esc(name)}</button>`).join('');
  $('chips').hidden = categories().length === 0;
  $('sortButton').textContent = view.byDue ? '並び：納期順' : '並び：いつもの順';
  const doneCount = all.filter(t => t.completed).length;
  $('clearDoneButton').hidden = view.filter === 'open' || doneCount === 0;

  let shown = all.filter(t => view.filter === 'all' || (view.filter === 'done') === !!t.completed)
    .filter(t => !view.category || t.categoryId === view.category)
    .sort(view.byDue ? byDue : byOrder);
  if (view.filter === 'all') shown = [...shown.filter(t => !t.completed), ...shown.filter(t => t.completed)];
  $('list').innerHTML = shown.map(card).join('');
  $('emptyText').hidden = shown.length > 0;
  $('emptyText').textContent = view.filter === 'done' ? '完了したタスクはありません' : 'タスクはありません';
}

function card(t) {
  const c = category(t.categoryId);
  const meta = [];
  if (c && !c.deleted) meta.push(`<span class="cat"><i style="background:${esc(c.color)}"></i>${esc(c.name)}</span>`);
  if (t.dueDate) {
    const n = daysLeft(t.dueDate);
    meta.push(`<span class="${t.completed ? '' : n < 0 ? 'overdue' : n <= 1 ? 'soon' : ''}">${esc(dueLabel(t))}</span>`);
  }
  const secs = totalSeconds(t);
  if (secs > 0) meta.push(`<span>作業 ${duration(secs)}</span>`);
  return `<li class="task ${t.completed ? 'done' : ''}" data-id="${esc(t.id)}" style="--cat:${esc(c?.color || NO_CATEGORY)}">
    <button class="check" aria-label="${t.completed ? '未完了に戻す' : '完了にする'}"><svg viewBox="0 0 24 24"><path d="M6 12.5l4 4 8-9"/></svg></button>
    <div class="body"><p class="title">${esc(t.title)}</p>${meta.length ? `<p class="meta">${meta.join('')}</p>` : ''}</div>
  </li>`;
}

function setSync(pending, error) {
  $('syncText').textContent = store.tryOut ? '' : error ? '同期エラー' : !navigator.onLine ? 'オフライン' : pending ? '同期中…' : '同期済み';
  $('syncText').className = 'sync' + (error ? ' error' : '');
}

function showError(e) { console.error(e); setSync(false, e); }

// ---- tasks ----
$('addForm').addEventListener('submit', e => {
  e.preventDefault();
  const title = $('addInput').value.trim();
  if (!title) return;
  const order = Math.max(-1, ...tasks().map(t => t.sortOrder ?? 0)) + 1;
  put('tasks', newId(), {
    title, completed: false, completedAt: null, dueDate: null, categoryId: view.category || null,
    sortOrder: order, createdAt: nowIso(), timeLog: [], deleted: false,
  });
  $('addInput').value = '';
  if (view.filter === 'done') { view.filter = 'open'; remember(); render(); }
});

$('list').addEventListener('click', e => {
  const li = e.target.closest('.task');
  if (!li) return;
  const t = data.tasks.get(li.dataset.id);
  if (e.target.closest('.check')) {
    const completed = !t.completed;
    put('tasks', t.id, { completed, completedAt: completed ? nowIso() : null });
  } else openTask(t);
});

function openTask(t) {
  editing = t.id;
  $('editTitle').value = t.title;
  $('editDue').value = t.dueDate || '';
  $('editCategory').innerHTML = `<option value="">なし</option>` + categories().map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
  $('editCategory').value = category(t.categoryId) && !category(t.categoryId).deleted ? t.categoryId : '';
  const secs = totalSeconds(t);
  $('editTime').textContent = secs > 0 ? `作業時間 合計 ${duration(secs)}（内訳と計測はPCアプリで）` : '';
  $('taskSheet').showModal();
}

$('clearDue').addEventListener('click', () => { $('editDue').value = ''; });
// Saved on the form's submit (the 閉じる button), which fires before the dialog closes.
$('taskSheet').querySelector('form').addEventListener('submit', saveEdit);
$('taskSheet').addEventListener('cancel', saveEdit);
function saveEdit() {
  const t = data.tasks.get(editing);
  editing = null;
  if (!t || t.deleted) return;
  const title = $('editTitle').value.trim().replace(/\s*\n\s*/g, ' ');
  const changes = {};
  if (title && title !== t.title) changes.title = title;
  if (($('editDue').value || null) !== (t.dueDate || null)) changes.dueDate = $('editDue').value || null;
  if (($('editCategory').value || null) !== (t.categoryId || null)) changes.categoryId = $('editCategory').value || null;
  if (Object.keys(changes).length) put('tasks', t.id, changes);
}
$('deleteTask').addEventListener('click', async () => {
  const t = data.tasks.get(editing);
  if (!t || !await confirmBox(`「${t.title}」を削除しますか？`)) return;
  editing = null;
  put('tasks', t.id, { deleted: true });
  $('taskSheet').close();
});
$('clearDoneButton').addEventListener('click', async () => {
  const done = tasks().filter(t => t.completed);
  if (!await confirmBox(`完了したタスク${done.length}件を削除しますか？`)) return;
  done.forEach(t => put('tasks', t.id, { deleted: true }));
});

$('tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { view.filter = b.dataset.filter; remember(); render(); } });
$('chips').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { view.category = b.dataset.cat; remember(); render(); } });
$('sortButton').addEventListener('click', () => { view.byDue = !view.byDue; remember(); render(); });

function confirmBox(text) {
  return new Promise(resolve => {
    const sheet = $('confirmSheet'), form = sheet.querySelector('form');
    const done = yes => { form.removeEventListener('submit', onSubmit); sheet.removeEventListener('cancel', onCancel); resolve(yes); };
    const onSubmit = e => done(e.submitter?.value === 'yes');
    const onCancel = () => done(false);
    form.addEventListener('submit', onSubmit);
    sheet.addEventListener('cancel', onCancel);
    $('confirmText').textContent = text;
    sheet.showModal();
  });
}

// ---- settings and categories ----
$('settingsButton').addEventListener('click', () => { renderCategories(); $('catMessage').textContent = ''; $('settingsSheet').showModal(); });

function renderCategories() {
  $('accountText').textContent = store.tryOut ? 'お試しモード（同期なし）' : `ログイン中：${user.email}`;
  $('signOutButton').hidden = store.tryOut;
  $('catList').innerHTML = categories().map(c => `<li data-id="${esc(c.id)}">
    <select class="color" aria-label="色" style="--c:${esc(c.color)}">${PALETTE.map(([n, v]) => `<option value="${v}" ${v.toUpperCase() === String(c.color).toUpperCase() ? 'selected' : ''}>${n}</option>`).join('')}</select>
    <input class="name" value="${esc(c.name)}" maxlength="40" aria-label="名前">
    <button type="button" class="small danger del">削除</button></li>`).join('') || '<li class="sub">カテゴリはまだありません</li>';
}

$('catList').addEventListener('change', e => {
  const li = e.target.closest('li[data-id]');
  if (!li) return;
  if (e.target.classList.contains('color')) { put('categories', li.dataset.id, { color: e.target.value }); e.target.style.setProperty('--c', e.target.value); }
  if (e.target.classList.contains('name')) {
    const name = e.target.value.trim();
    if (!name) { e.target.value = category(li.dataset.id).name; return; }
    put('categories', li.dataset.id, { name });
  }
});
$('catList').addEventListener('click', async e => {
  const li = e.target.closest('li[data-id]');
  if (!li || !e.target.classList.contains('del')) return;
  const c = category(li.dataset.id);
  const used = tasks().filter(t => t.categoryId === c.id);
  if (!await confirmBox(`カテゴリ「${c.name}」を削除しますか？` + (used.length ? `\n${used.length}件のタスクは「なし」になります。` : ''))) return;
  used.forEach(t => put('tasks', t.id, { categoryId: null }));
  put('categories', c.id, { deleted: true });
  renderCategories();
});
$('addCat').addEventListener('click', () => {
  const name = $('catName').value.trim();
  if (!name) return;
  if (categories().some(c => c.name === name)) { $('catMessage').textContent = '同じ名前のカテゴリがあります'; return; }
  const list = categories();
  put('categories', newId(), { name, color: PALETTE[list.length % PALETTE.length][1], sortOrder: list.length ? Math.max(...list.map(c => c.sortOrder ?? 0)) + 1 : 0, deleted: false });
  $('catName').value = ''; $('catMessage').textContent = '';
  setTimeout(renderCategories);
});
$('signOutButton').addEventListener('click', () => { $('settingsSheet').close(); store.signOut(); });

// ---- sign-in ----
const AUTH_ERRORS = {
  'auth/invalid-credential': 'メールアドレスかパスワードが違います',
  'auth/wrong-password': 'メールアドレスかパスワードが違います',
  'auth/user-not-found': 'メールアドレスかパスワードが違います',
  'auth/invalid-email': 'メールアドレスの形が正しくありません',
  'auth/email-already-in-use': 'このメールアドレスはもう登録されています。ログインしてください',
  'auth/weak-password': 'パスワードは6文字以上にしてください',
  'auth/too-many-requests': '試行が多すぎます。しばらく待ってからもう一度どうぞ',
  'auth/network-request-failed': 'ネットにつながっていません',
};
const authMessage = e => AUTH_ERRORS[e?.code] || 'うまくいきませんでした（' + (e?.code || e) + '）';

function setMode(signUp) {
  signUpMode = signUp;
  $('loginButton').textContent = signUp ? 'アカウントを作る' : 'ログイン';
  $('modeButton').textContent = signUp ? 'アカウントを持っている（ログイン）' : 'はじめて使う（アカウントを作る）';
  $('password').autocomplete = signUp ? 'new-password' : 'current-password';
  $('loginMessage').textContent = signUp ? 'パスワードは6文字以上にしてください。' : '';
  $('loginMessage').className = 'message';
}
$('modeButton').addEventListener('click', () => setMode(!signUpMode));
$('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  $('loginButton').disabled = true;
  try {
    const email = $('email').value.trim(), password = $('password').value;
    await (signUpMode ? store.signUp(email, password) : store.signIn(email, password));
  } catch (err) {
    $('loginMessage').textContent = authMessage(err); $('loginMessage').className = 'message error';
  } finally { $('loginButton').disabled = false; }
});
$('resetButton').addEventListener('click', async () => {
  const email = $('email').value.trim();
  const box = $('loginMessage');
  if (!email) { box.textContent = 'メールアドレスを入れてから押してください'; box.className = 'message error'; return; }
  try { await store.resetPassword(email); box.textContent = '再設定のメールを送りました（届いていない場合は迷惑メールも確認してください）'; box.className = 'message'; }
  catch (err) { box.textContent = authMessage(err); box.className = 'message error'; }
});

// ---- start ----
// iPhone Safari (not yet on the home screen): show how to add it. navigator.standalone exists only on iOS.
if (navigator.standalone === false && !load('desktop-todo-hint', { closed: false }).closed) $('installHint').hidden = false;
$('installClose').addEventListener('click', () => {
  $('installHint').hidden = true;
  try { localStorage.setItem('desktop-todo-hint', JSON.stringify({ closed: true })); } catch { }
});
addEventListener('online', () => setSync(false));
addEventListener('offline', () => setSync(false));
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });

store = await createStore(firebaseConfig);
$('tryOutBanner').hidden = !store.tryOut;
store.onUser(u => {
  user = u;
  $('login').hidden = !!u;
  $('app').hidden = !u;
  if (!u) { data = { tasks: new Map(), categories: new Map() }; setMode(false); return; }
  store.watch(u.uid, (state, error) => { data = state; setSync(state.pending, error); render(); });
});
