// Work time on the phone: the breakdown and donut chart the PC app shows, plus a timer.
// The timer keeps only its start time on this phone (localStorage), so it survives closing the app;
// stopping adds the time to the task's timeLog (split at midnight), which syncs to the PC like any edit.
import { ymd } from './calendar.js';
import { toast } from './ui.js';

const KEY = 'desktop-todo-timer';
const UNCLASSIFIED = '#C9B4A8';
const COLORS = ['#6FA8C9', '#7DB58F', '#E3B04B', '#A58BD1', '#E88FA8', '#E07A5F', '#4F8A8B', '#C98C5A'];
const MAX_ENTRY = 86400, MAX_SESSION = 12 * 3600;

export const clock = s => `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
export function duration(seconds) {
  const m = Math.floor(seconds / 60);
  return m >= 60 ? `${Math.floor(m / 60)}時間${String(m % 60).padStart(2, '0')}分` : seconds > 0 && m === 0 ? '1分未満' : `${m}分`;
}

export function initWorkTime({ $, esc, put, task, allTasks, onChange = () => { } }) {
  let shown = null;
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } };
  const write = v => { try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY); } catch { } };
  const running = () => read();
  const elapsed = () => { const r = read(); return r ? Math.min(MAX_SESSION, Math.max(0, Math.floor((Date.now() - r.start) / 1000))) : 0; };
  const kinds = () => [...new Set(allTasks().flatMap(t => (t.timeLog ?? []).map(e => e.kind ?? '')).filter(Boolean))].sort();

  function start(t, kind) {
    if (running()) stop();
    write({ id: t.id, kind, start: Date.now() });
    onChange(); tick();
  }
  /** Adds the running time to its task (split at midnight) and clears the timer. */
  function stop() {
    const r = read(); if (!r) return;
    write(null);
    const t = task(r.id);
    const end = Math.min(Date.now(), r.start + MAX_SESSION * 1000);
    if (!t || t.deleted || end - r.start < 1000) { onChange(); tick(); return; }
    const log = (t.timeLog ?? []).map(e => ({ ...e }));
    for (let from = r.start; from < end;) {
      const day = new Date(from); const next = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime();
      const to = Math.min(end, next), secs = Math.round((to - from) / 1000), date = ymd(day);
      const entry = log.find(e => e.date === date && (e.kind ?? '') === r.kind);
      if (entry) entry.seconds = Math.min(MAX_ENTRY, (entry.seconds ?? 0) + secs);
      else log.push({ date, kind: r.kind, seconds: Math.min(MAX_ENTRY, secs) });
      from = to;
    }
    put('tasks', t.id, { timeLog: log });
    toast(`${duration(Math.round((end - r.start) / 1000))}を記録しました`);
    onChange(); tick();
  }

  // Live clock on the card and in the open sheet.
  function tick() {
    const r = running();
    for (const el of document.querySelectorAll('[data-timer]')) el.textContent = r && el.dataset.timer === r.id ? `計測中 ${clock(elapsed() + (el.dataset.base | 0))}` : '';
    if (shown && r?.id === shown.id) renderSection(task(shown.id) ?? shown);
  }
  setInterval(() => { if (running()) tick(); }, 1000);

  function colorOf(kind, order) { return kind === '' ? UNCLASSIFIED : COLORS[order.indexOf(kind) % COLORS.length]; }
  function donut(parts, total) {
    const r = 42, c = 2 * Math.PI * r;
    if (!total) return `<svg viewBox="0 0 100 100" class="donut"><circle cx="50" cy="50" r="${r}" class="empty"/></svg>`;
    let at = 0;
    const gap = parts.length > 1 ? 1.5 : 0;
    return `<svg viewBox="0 0 100 100" class="donut">${parts.map(([color, s]) => {
      const len = Math.max(0, s / total * c - gap), seg = `<circle cx="50" cy="50" r="${r}" stroke="${esc(color)}" stroke-dasharray="${len} ${c}" stroke-dashoffset="${-at}"/>`;
      at += s / total * c; return seg;
    }).join('')}</svg>`;
  }

  /** The 作業時間 part of the task sheet. */
  function renderSection(t) {
    shown = t;
    const r = running(), live = r?.id === t.id ? elapsed() : 0;
    const log = (t.timeLog ?? []).filter(e => e.seconds > 0);
    const byKind = new Map();
    for (const e of log) byKind.set(e.kind ?? '', (byKind.get(e.kind ?? '') ?? 0) + e.seconds);
    if (live) byKind.set(r.kind, (byKind.get(r.kind) ?? 0) + live);
    const order = [...byKind.keys()].filter(Boolean).sort();
    const total = [...byKind.values()].reduce((a, b) => a + b, 0);
    const todayKey = ymd(new Date());
    const today = log.filter(e => e.date === todayKey).reduce((a, e) => a + e.seconds, 0) + live;
    const parts = [...byKind].sort((a, b) => b[1] - a[1]).map(([k, s]) => [colorOf(k, order), s, k]);
    const days = [...new Set(log.map(e => e.date))].sort().reverse().slice(0, 7);
    const kindChoice = ['', ...new Set([...kinds(), ...(r?.kind ? [r.kind] : [])])];
    $('timeSection').innerHTML = `
      <h3>作業時間</h3>
      <div class="time-top">
        <div class="donut-wrap">${donut(parts.map(([c, s]) => [c, s]), total)}<div class="donut-mid"><b>${total ? duration(total) : '0分'}</b><span>${live ? '計測中' : '合計'}</span></div></div>
        <ul class="legend">${parts.map(([c, s, k]) => `<li><i style="background:${esc(c)}"></i><span>${esc(k || '未分類')}</span><b>${duration(s)}・${Math.round(s / total * 100)}%</b></li>`).join('') || '<li class="sub">まだ記録がありません</li>'}
          <li class="sub">今日 ${duration(today)}</li></ul>
      </div>
      <div class="row timer-row">
        <select id="timerKind" aria-label="作業の種類" ${live ? 'disabled' : ''}>${kindChoice.map(k => `<option value="${esc(k)}" ${(live ? r.kind : '') === k ? 'selected' : ''}>${esc(k || '未分類')}</option>`).join('')}</select>
        <button type="button" class="${live ? 'danger' : 'primary'}" id="timerButton">${live ? `止める ${clock(live)}` : '計測を始める'}</button>
      </div>
      ${days.length ? `<ul class="days">${days.map(d => {
        const list = log.filter(e => e.date === d);
        return `<li><span>${Number(d.slice(5, 7))}/${Number(d.slice(8))}</span><span class="kinds">${list.map(e => esc(e.kind || '未分類')).join('・')}</span><b>${duration(list.reduce((a, e) => a + e.seconds, 0))}</b></li>`;
      }).join('')}</ul>` : ''}
      <p class="sub">記録の修正や種類の追加はPCアプリで行えます。</p>`;
    $('timerButton').onclick = () => { if (running()?.id === t.id) stop(); else start(t, $('timerKind').value); renderSection(task(t.id) ?? t); };
  }
  function closeSection() { shown = null; }
  return { running, elapsed, stop, renderSection, closeSection, tick };
}
