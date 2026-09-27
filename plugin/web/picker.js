// Two-level chooser: groups on the left (tracks, or parameter groups), their items
// on the right, and a search box that flattens everything. Replaces long <select>s.
//
//   openPicker({ title, groups, selected, onPick, note })
//   groups: [{ id, name, section?, meter?, items: [{ key, name, detail?, meter? }] }]
//   `meter` keys are filled in by the caller's update loop via picker.meters().

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
function meter(key) {
  const node = el('meter', 'picker-meter');
  node.min = 0; node.max = 1; node.value = 0; node.dataset.meter = key;
  node.setAttribute('aria-hidden', 'true');
  return node;
}

let current = null;
export const openPickerNow = () => current;

export function openPicker({ title, groups, selected, onPick, note = '', searchLabel = 'Search' }) {
  current?.close();
  const sheet = el('section', 'picker');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', title);
  const head = el('div', 'picker-head');
  const heading = el('h2', '', title);
  const close = el('button', 'picker-close', '×');
  close.setAttribute('aria-label', 'Close');
  head.append(heading, close);
  const search = el('input', 'picker-search');
  search.type = 'search';
  search.placeholder = searchLabel;
  search.setAttribute('aria-label', searchLabel);
  const hint = el('p', 'picker-note', note);
  const body = el('div', 'picker-body');
  const left = el('div', 'picker-groups');
  left.setAttribute('role', 'listbox');
  left.setAttribute('aria-label', 'Groups');
  const right = el('div', 'picker-items');
  right.setAttribute('role', 'listbox');
  right.setAttribute('aria-label', 'Choices');
  body.append(left, right);
  sheet.append(head, search, hint, body);

  let list = groups;
  let active = list.find(g => g.items.some(i => i.key === selected))?.id ?? list[0]?.id;

  function item(entry, label = entry.name) {
    const button = el('button', `picker-item${entry.key === selected ? ' selected' : ''}`);
    button.type = 'button';
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', String(entry.key === selected));
    button.dataset.key = entry.key;
    const name = el('span', 'picker-name', label);
    button.append(name);
    if (entry.detail) button.append(el('span', 'picker-detail', entry.detail));
    if (entry.meter) button.append(meter(entry.meter));
    button.onclick = () => { close.onclick(); onPick(entry.key); };
    return button;
  }
  function render() {
    const query = search.value.trim().toLowerCase();
    left.replaceChildren();
    right.replaceChildren();
    body.classList.toggle('searching', !!query);
    if (query) {
      const words = query.split(/\s+/);
      // Every word must match somewhere; words that match the item itself rank it
      // higher, so "kick drum kick" puts "Kick Drum · Kick hits" first.
      const matches = list.flatMap(g => g.items.map(i => ({ g, i, text: `${g.section ?? ''} ${g.name} ${i.name} ${i.detail ?? ''}`.toLowerCase() })))
        .filter(m => words.every(w => m.text.includes(w)))
        .map(m => ({ ...m, score: words.filter(w => m.i.name.toLowerCase().includes(w)).length }))
        .sort((a, b) => b.score - a.score);
      if (!matches.length) right.append(el('p', 'picker-empty', 'Nothing matches.'));
      for (const m of matches.slice(0, 80)) right.append(item(m.i, `${m.g.name} · ${m.i.name}`));
      return;
    }
    let section;
    for (const group of list) {
      if (group.section && group.section !== section) {
        section = group.section;
        left.append(el('h3', 'picker-section', section));
      }
      const button = el('button', `picker-group${group.id === active ? ' active' : ''}`);
      button.type = 'button';
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', String(group.id === active));
      button.dataset.group = group.id;
      button.append(el('span', 'picker-name', group.name));
      if (group.meter) button.append(meter(group.meter));
      button.onclick = () => { active = group.id; render(); };
      left.append(button);
    }
    const group = list.find(g => g.id === active);
    if (!group) right.append(el('p', 'picker-empty', 'Nothing to choose yet.'));
    else for (const entry of group.items) right.append(item(entry));
  }

  search.oninput = render;
  search.onkeydown = event => {
    if (event.key === 'Enter') { right.querySelector('.picker-item')?.click(); event.preventDefault(); }
  };
  sheet.onkeydown = event => { if (event.key === 'Escape') { close.onclick(); event.stopPropagation(); } };
  const picker = {
    element: sheet,
    /** Replace the groups (e.g. tracks appeared) keeping the open group and search. */
    update(next, nextNote = hint.textContent) {
      list = next;
      hint.textContent = nextNote;
      if (!list.some(g => g.id === active)) active = list[0]?.id;
      render();
    },
    meters: () => sheet.querySelectorAll('meter[data-meter]'),
    close() { close.onclick(); },
  };
  close.onclick = () => {
    if (current !== picker) return;
    current = null;
    sheet.remove();
  };
  render();
  document.body.append(sheet);
  current = picker;
  search.focus();
  return picker;
}
