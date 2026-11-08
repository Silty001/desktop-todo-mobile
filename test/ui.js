// Small shared pieces of UI.
const $ = id => document.getElementById(id);
let timer = null, undo = null;

/** Shows a message at the bottom for 5 seconds; with onUndo it carries a 元に戻す button. */
export function toast(text, onUndo) {
  clearTimeout(timer);
  undo = onUndo ?? null;
  $('toastText').textContent = text;
  $('toastUndo').hidden = !onUndo;
  $('toast').hidden = false;
  timer = setTimeout(() => { $('toast').hidden = true; undo = null; }, 5000);
}
$('toastUndo').addEventListener('click', () => { const u = undo; undo = null; $('toast').hidden = true; clearTimeout(timer); u?.(); });
