// Swipe a task card sideways: right = complete (or back to open), left = delete. Like a phone mail app.
// Only a mostly sideways move counts, so scrolling up and down is untouched; a long press still starts reordering.
const START = 12, ACT = 0.33;

export function enableSwipe(list, { enabled, onRight, onLeft, rightLabel, onState }) {
  let s = null;
  function begin(li, x, y) { s = { li, x, y, dx: 0, active: false }; }
  function move(e, x, y) {
    if (!s) return;
    const dx = x - s.x, dy = y - s.y;
    if (!s.active) {
      if (Math.abs(dy) > START && Math.abs(dy) > Math.abs(dx)) { s = null; return; }   // scrolling
      if (Math.abs(dx) < START || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      s.active = true;
      onState?.(true);
      const r = s.li.getBoundingClientRect(), lr = list.getBoundingClientRect();
      s.under = document.createElement('div');
      s.under.className = 'swipe-under';
      Object.assign(s.under.style, { top: (r.top - lr.top) + 'px', height: r.height + 'px' });
      s.under.innerHTML = `<span class="r">${rightLabel(s.li.dataset.id)}</span><span class="l">削除</span>`;
      list.prepend(s.under);
      s.li.style.transition = 'none';
    }
    e.preventDefault();
    s.dx = dx;
    s.li.style.transform = `translateX(${dx}px)`;
    const width = s.li.offsetWidth;
    s.under.classList.toggle('right', dx > 0);
    s.under.classList.toggle('left', dx < 0);
    s.under.classList.toggle('ready', Math.abs(dx) > width * ACT);
  }
  function end() {
    if (!s) return;
    const { li, dx, active, under } = s; s = null;
    if (!active) return;
    const width = li.offsetWidth, go = Math.abs(dx) > width * ACT;
    li.style.transition = 'transform 180ms ease';
    if (go && dx < 0) {
      li.style.transform = `translateX(${-width - 20}px)`;
      setTimeout(() => finish(() => onLeft(li.dataset.id)), 170);
    } else {
      li.style.transform = '';
      setTimeout(() => finish(go ? () => onRight(li.dataset.id) : null), 170);
    }
    function finish(action) {
      under.remove(); li.style.removeProperty('transition'); li.style.removeProperty('transform');
      onState?.(false);
      action?.();
    }
    // The tap that ends a swipe must not open the task.
    const swallow = ev => { ev.stopPropagation(); ev.preventDefault(); };
    list.addEventListener('click', swallow, true);
    setTimeout(() => list.removeEventListener('click', swallow, true), 400);
  }
  list.addEventListener('touchstart', e => {
    const li = e.target.closest('.task');
    if (li && e.touches.length === 1 && enabled() && !e.target.closest('.check')) begin(li, e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });
  list.addEventListener('touchmove', e => move(e, e.touches[0].clientX, e.touches[0].clientY), { passive: false });
  list.addEventListener('touchend', end);
  list.addEventListener('touchcancel', () => { if (s?.active) { s.dx = 0; } end(); });
}
