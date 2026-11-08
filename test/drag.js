// Long-press to pick up a card, drag to a new place, release to drop. Works with touch (iPhone) and the mouse.
// A quick swipe still scrolls the list: the card is only picked up after holding still for HOLD ms.
const HOLD = 450, SLOP = 8, SLIDE = 'transform 180ms cubic-bezier(.2, .8, .3, 1)';

// Moves elements to their new places, then slides each from where it was (FLIP), so cards glide instead of jumping.
function slide(elements, change) {
  const before = new Map(elements.map(el => [el, el.getBoundingClientRect().top]));
  change();
  for (const el of elements) {
    const dy = before.get(el) - el.getBoundingClientRect().top;
    if (Math.abs(dy) < 0.5) continue;
    el.style.transition = 'none';
    el.style.transform = `translateY(${dy}px)`;
    el.getBoundingClientRect();
    el.style.transition = SLIDE;
    el.style.transform = '';
  }
}

export function enableDrag(list, { enabled, onDrop, onState }) {
  let timer = null, start = null, drag = null, suppressClick = false, settling = false;

  function pick(li, y) {
    const rect = li.getBoundingClientRect();
    const ph = document.createElement('li');
    ph.className = 'placeholder'; ph.style.height = rect.height + 'px';
    li.after(ph);
    drag = { li, ph, offset: y - rect.top, y };
    Object.assign(li.style, { position: 'fixed', left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', zIndex: 20 });
    li.classList.add('dragging');
    navigator.vibrate?.(12);
    onState?.(true);
    scroll();
  }
  function move(y) {
    drag.y = y;
    drag.li.style.top = (y - drag.offset) + 'px';
    // Compare with each card's resting place (offsetTop ignores the slide still in progress), so cards do not flicker.
    const others = [...list.children].filter(el => el !== drag.li);
    const top = others[0]?.offsetParent?.getBoundingClientRect().top ?? 0;
    let before = null;
    for (const el of others) {
      if (el === drag.ph) continue;
      if (y - top < el.offsetTop + el.offsetHeight / 2) { before = el; break; }
    }
    const target = before ?? null;
    if (drag.ph.nextElementSibling === target || (!target && list.lastElementChild === drag.ph)) return;
    slide(others, () => target ? list.insertBefore(drag.ph, target) : list.appendChild(drag.ph));
  }
  // Scrolls while the finger is near the top or bottom edge.
  function scroll() {
    if (!drag) return;
    const edge = 90, bottom = innerHeight - 110;
    const step = drag.y < edge ? -(edge - drag.y) / 6 : drag.y > bottom ? (drag.y - bottom) / 6 : 0;
    if (step) { scrollBy(0, step); move(drag.y); }
    requestAnimationFrame(scroll);
  }
  function drop(commit) {
    const { li, ph } = drag; drag = null;
    const from = li.getBoundingClientRect().top;
    ph.replaceWith(li);
    for (const p of ['position', 'left', 'top', 'width', 'z-index']) li.style.removeProperty(p);
    li.classList.remove('dragging');
    // Settle into the gap from where the finger let go.
    li.style.transition = 'none';
    li.style.transform = `translateY(${from - li.getBoundingClientRect().top}px)`;
    li.getBoundingClientRect();
    li.style.transition = SLIDE;
    li.style.transform = '';
    // The list is not redrawn until the card has settled, or the slide would be cut short.
    settling = true;
    if (commit) onDrop(li.dataset.id, [...list.children].map(el => el.dataset.id));
    setTimeout(() => { settling = false; onState?.(false); }, 220);
  }
  function press(target, x, y) {
    const li = target.closest('.task');
    if (!li || target.closest('.check') || !enabled()) return;
    start = { x, y };
    timer = setTimeout(() => { timer = null; pick(li, y); }, HOLD);
  }
  function cancelHold(x, y) {
    if (timer && Math.hypot(x - start.x, y - start.y) > SLOP) { clearTimeout(timer); timer = null; }
  }
  function release(commit) {
    clearTimeout(timer); timer = null;
    if (!drag) return false;
    suppressClick = true; drop(commit); return true;
  }

  list.addEventListener('touchstart', e => { if (e.touches.length === 1) press(e.target, e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
  list.addEventListener('touchmove', e => {
    const t = e.touches[0];
    cancelHold(t.clientX, t.clientY);
    if (drag) { e.preventDefault(); move(t.clientY); }
  }, { passive: false });
  list.addEventListener('touchend', e => { if (release(true)) e.preventDefault(); });
  list.addEventListener('touchcancel', () => release(false));

  list.addEventListener('mousedown', e => { if (e.button === 0) press(e.target, e.clientX, e.clientY); });
  addEventListener('mousemove', e => { if (timer) cancelHold(e.clientX, e.clientY); if (drag) { e.preventDefault(); move(e.clientY); } });
  addEventListener('mouseup', () => release(true));

  // The click that ends a hold must not open the task.
  list.addEventListener('click', e => { if (suppressClick) { suppressClick = false; e.stopPropagation(); e.preventDefault(); } }, true);
  list.addEventListener('contextmenu', e => { if (e.target.closest('.task')) e.preventDefault(); });
  return { get busy() { return !!drag || settling; } };
}
