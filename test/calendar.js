// Month calendar for the ToDo page, like the PC app's: a dot per category of the open tasks due that day (up to 3).
const WEEK = '日月火水木金土';
const NO_CATEGORY_DOT = '#B9A196', DONE_DOT = '#EBC4AD', MAX_DOTS = 3;
export const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function renderCalendar(el, { month, selected, tasks, categories, esc }) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first); start.setDate(1 - first.getDay());
  const todayKey = ymd(new Date());
  const order = new Map(categories.map((c, i) => [c.id, i]));
  const color = new Map(categories.map(c => [c.id, c.color]));
  const byDay = new Map();
  for (const t of tasks) if (t.dueDate) (byDay.get(t.dueDate) ?? byDay.set(t.dueDate, []).get(t.dueDate)).push(t);
  let cells = '';
  for (let i = 0; i < 42; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const key = ymd(d), list = byDay.get(key) ?? [], open = list.filter(t => !t.completed);
    const cats = [...new Set(open.map(t => t.categoryId && color.has(t.categoryId) ? t.categoryId : ''))]
      .sort((a, b) => (a ? order.get(a) : 1e9) - (b ? order.get(b) : 1e9)).slice(0, MAX_DOTS);
    const dots = open.length ? cats.map(c => c ? color.get(c) : NO_CATEGORY_DOT) : list.length ? [DONE_DOT] : [];
    const cls = [d.getMonth() !== month.getMonth() && 'out', key === todayKey && 'today', key === selected && 'sel',
      open.some(() => key < todayKey) && 'late', d.getDay() === 0 && 'sun', d.getDay() === 6 && 'sat'].filter(Boolean).join(' ');
    cells += `<button type="button" class="day ${cls}" data-day="${key}"><span>${d.getDate()}</span><i>${dots.map(c => `<b style="background:${esc(c)}"></b>`).join('')}</i></button>`;
  }
  el.innerHTML = `<div class="cal-head"><button type="button" class="small" data-move="-1" aria-label="前の月">‹</button>
    <b>${month.getFullYear()}年${month.getMonth() + 1}月</b>
    <button type="button" class="small" data-move="1" aria-label="次の月">›</button>
    <button type="button" class="small" data-move="0">今日</button></div>
    <div class="cal-week">${[...WEEK].map((w, i) => `<span class="${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${w}</span>`).join('')}</div>
    <div class="cal-grid">${cells}</div>`;
}
