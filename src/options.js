import {
  getKeywords,
  setKeywords,
  newEntry,
  getRepoPath,
  setRepoPath,
} from './storage.js';

const el = (id) => document.getElementById(id);

let entries = [];
let saveTimer = null;
let dragSrcId = null;

function renderVersion() {
  el('version').textContent = `v${chrome.runtime.getManifest().version}`;
}

function renderList() {
  const list = el('list');
  list.innerHTML = '';
  for (const entry of entries) {
    list.appendChild(renderRow(entry));
  }
}

function renderRow(entry) {
  const li = document.createElement('li');
  li.dataset.id = entry.id;
  li.draggable = true;

  const handle = document.createElement('span');
  handle.className = 'drag-handle';
  handle.textContent = '\u2630';
  handle.title = 'Drag to reorder';

  const termInput = document.createElement('input');
  termInput.type = 'text';
  termInput.className = 'term-input';
  termInput.placeholder = 'e.g. hydrogen peroxide, Clorox, AHP';
  termInput.value = entry.term;
  termInput.spellcheck = false;
  termInput.addEventListener('input', () => {
    entry.term = termInput.value;
    schedulePersist();
  });

  const wholeCell = document.createElement('span');
  wholeCell.className = 'flag-cell';
  const whole = document.createElement('input');
  whole.type = 'checkbox';
  whole.checked = !!entry.wholeWord;
  whole.addEventListener('change', () => {
    entry.wholeWord = whole.checked;
    schedulePersist();
  });
  wholeCell.appendChild(whole);

  const headingCell = document.createElement('span');
  headingCell.className = 'flag-cell';
  const heading = document.createElement('input');
  heading.type = 'checkbox';
  heading.checked = !!entry.headingBoost;
  heading.addEventListener('change', () => {
    entry.headingBoost = heading.checked;
    schedulePersist();
  });
  headingCell.appendChild(heading);

  const del = document.createElement('button');
  del.className = 'delete-btn';
  del.textContent = '\u2715';
  del.title = 'Delete';
  del.addEventListener('click', () => {
    entries = entries.filter((e) => e.id !== entry.id);
    renderList();
    schedulePersist();
  });

  li.append(handle, termInput, wholeCell, headingCell, del);

  li.addEventListener('dragstart', (ev) => {
    dragSrcId = entry.id;
    li.classList.add('dragging');
    ev.dataTransfer.effectAllowed = 'move';
    ev.dataTransfer.setData('text/plain', entry.id);
  });
  li.addEventListener('dragend', () => {
    li.classList.remove('dragging');
    clearDragHints();
    dragSrcId = null;
  });
  li.addEventListener('dragover', (ev) => {
    ev.preventDefault();
    clearDragHints();
    const rect = li.getBoundingClientRect();
    const before = (ev.clientY - rect.top) < rect.height / 2;
    li.classList.add(before ? 'drag-over-top' : 'drag-over-bottom');
    ev.dataTransfer.dropEffect = 'move';
  });
  li.addEventListener('dragleave', () => {
    clearDragHints();
  });
  li.addEventListener('drop', (ev) => {
    ev.preventDefault();
    clearDragHints();
    if (!dragSrcId || dragSrcId === entry.id) return;
    const srcIdx = entries.findIndex((e) => e.id === dragSrcId);
    const dstIdx = entries.findIndex((e) => e.id === entry.id);
    if (srcIdx < 0 || dstIdx < 0) return;
    const [moved] = entries.splice(srcIdx, 1);
    const rect = li.getBoundingClientRect();
    const insertBefore = (ev.clientY - rect.top) < rect.height / 2;
    const newDst = entries.findIndex((e) => e.id === entry.id);
    entries.splice(insertBefore ? newDst : newDst + 1, 0, moved);
    renderList();
    schedulePersist();
  });

  return li;
}

function clearDragHints() {
  document.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach((n) => {
    n.classList.remove('drag-over-top', 'drag-over-bottom');
  });
}

function schedulePersist() {
  el('saveStatus').textContent = 'Saving…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const cleaned = entries
      .map((e) => ({ ...e, term: String(e.term || '').trim() }))
      .filter((e) => e.term.length > 0);
    await setKeywords(cleaned);
    el('saveStatus').textContent = 'Saved.';
    setTimeout(() => { el('saveStatus').textContent = ''; }, 1500);
  }, 300);
}

el('addBtn').addEventListener('click', () => {
  const entry = newEntry('');
  entries.push(entry);
  renderList();
  const last = el('list').lastElementChild;
  last?.querySelector('input[type="text"]')?.focus();
});

el('repoPath').addEventListener('input', (ev) => {
  setRepoPath(ev.target.value);
  renderInstallCmd(ev.target.value);
});

function renderInstallCmd(repoPath) {
  const extId = chrome.runtime.id;
  const cmd = [
    repoPath ? `cd "${repoPath.replace(/"/g, '\\"')}"` : 'cd /path/to/word-looker',
    `./scripts/install-native-host.sh ${extId}`,
  ].join(' && ');
  el('installCmd').textContent = cmd;
}

async function init() {
  renderVersion();
  entries = await getKeywords();
  renderList();
  const repoPath = await getRepoPath();
  el('repoPath').value = repoPath;
  renderInstallCmd(repoPath);
}

init();
