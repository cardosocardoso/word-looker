import { getKeywords, KEYS } from './storage.js';
import { entryToRegex } from './matcher.js';

const state = {
  entries: [],
  matches: [],
  byEntry: new Map(),
  activeEntryId: null,
  activeBucket: 'all',
  activeIndex: -1,
  panel: null,
  highlightTimer: null,
  ready: false,
};

const OVERLAY_ID = 'word-looker-panel';
const HIGHLIGHT_CLASS = 'wl-hit';
const ACTIVE_CLASS = 'wl-active';

async function main() {
  await waitForApp();
  loadCss();
  const app = window.PDFViewerApplication;
  app.eventBus.on('documentloaded', () => {
    state.ready = false;
    state.matches = [];
    state.byEntry.clear();
    state.activeEntryId = null;
    state.activeIndex = -1;
    renderPanel();
    scanDocument().catch(console.error);
  });
  if (app.pdfDocument) {
    scanDocument().catch(console.error);
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes[KEYS.KEYWORDS]) {
      scanDocument().catch(console.error);
    }
  });
}

function loadCss() {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = chrome.runtime.getURL('src/overlay.css');
  document.head.appendChild(link);
}

function waitForApp() {
  return new Promise((resolve) => {
    const tick = () => {
      const app = window.PDFViewerApplication;
      if (app && app.eventBus && app.initializedPromise) {
        app.initializedPromise.then(() => resolve(app));
      } else {
        setTimeout(tick, 50);
      }
    };
    tick();
  });
}

async function scanDocument() {
  const app = window.PDFViewerApplication;
  const pdf = app.pdfDocument;
  if (!pdf) return;
  state.entries = await getKeywords();
  state.matches = [];
  state.byEntry.clear();
  for (const e of state.entries) state.byEntry.set(e.id, { headings: [], body: [] });

  if (!state.entries.length) {
    state.ready = true;
    renderPanel();
    return;
  }

  const total = pdf.numPages;
  const concurrency = 6;
  let next = 1;
  async function worker() {
    while (true) {
      const p = next++;
      if (p > total) break;
      try {
        await scanPage(p);
      } catch (err) {
        console.warn('word-looker scan error', p, err);
      }
    }
  }
  const workers = [];
  for (let i = 0; i < concurrency; i++) workers.push(worker());
  await Promise.all(workers);
  state.ready = true;
  renderPanel();
}

async function scanPage(pageNum) {
  const app = window.PDFViewerApplication;
  const page = await app.pdfDocument.getPage(pageNum);
  const tc = await page.getTextContent({ includeMarkedContent: false });
  const items = tc.items;
  const styles = tc.styles || {};

  let flat = '';
  const offsets = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const s = item.str || '';
    const flatStart = flat.length;
    flat += s;
    offsets.push({ itemIdx: i, flatStart, flatEnd: flat.length });
    if (item.hasEOL) {
      flat += '\n';
    } else if (s.length && !/[\s-]$/.test(s)) {
      flat += ' ';
    }
  }

  const heights = [];
  for (const it of items) {
    const h = it.height;
    if (Number.isFinite(h) && h > 0) heights.push(h);
  }
  heights.sort((a, b) => a - b);
  const median = heights.length ? heights[Math.floor(heights.length / 2)] : 0;

  for (const entry of state.entries) {
    const rx = entryToRegex(entry);
    if (!rx) continue;
    rx.lastIndex = 0;
    let m;
    while ((m = rx.exec(flat)) !== null) {
      if (m[0].length === 0) { rx.lastIndex++; continue; }
      const start = m.index;
      const end = m.index + m[0].length;
      const startItem = findItemAt(offsets, start);
      const endItem = findItemAt(offsets, end - 1);
      if (startItem === -1 || endItem === -1) continue;

      let isHeading = false;
      if (entry.headingBoost) {
        for (let i = startItem; i <= endItem; i++) {
          const it = items[i];
          if (!it) continue;
          if (median > 0 && it.height >= median * 1.2) { isHeading = true; break; }
          const st = styles[it.fontName];
          if (st && /bold|black|heavy/i.test(st.fontFamily || '')) { isHeading = true; break; }
        }
      }

      const match = {
        entryId: entry.id,
        pageNum,
        startItem,
        startChar: start - offsets[startItem].flatStart,
        endItem,
        endChar: (end - 1) - offsets[endItem].flatStart + 1,
        isHeading,
        text: m[0],
      };
      state.matches.push(match);
      const bucket = state.byEntry.get(entry.id);
      if (!bucket) continue;
      (isHeading ? bucket.headings : bucket.body).push(match);
    }
  }
}

function findItemAt(offsets, flatPos) {
  let lo = 0, hi = offsets.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const o = offsets[mid];
    if (flatPos < o.flatStart) hi = mid - 1;
    else if (flatPos >= o.flatEnd) lo = mid + 1;
    else return mid;
  }
  return -1;
}

function renderPanel() {
  if (!state.panel) {
    state.panel = document.createElement('div');
    state.panel.id = OVERLAY_ID;
    state.panel.innerHTML = `
      <div class="wl-header">
        <span class="wl-title">Word Looker</span>
        <button class="wl-btn wl-min" title="Collapse">–</button>
        <button class="wl-btn wl-close" title="Hide overlay for this document">\u2715</button>
      </div>
      <div class="wl-body"></div>
      <div class="wl-footer">
        <button class="wl-link wl-edit">Edit words…</button>
      </div>
    `;
    document.body.appendChild(state.panel);
    setupPanelDrag(state.panel);
    state.panel.querySelector('.wl-min').addEventListener('click', () => {
      state.panel.classList.toggle('wl-collapsed');
    });
    state.panel.querySelector('.wl-close').addEventListener('click', () => {
      state.panel.style.display = 'none';
    });
    state.panel.querySelector('.wl-edit').addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'open-options' });
      chrome.runtime.openOptionsPage?.();
    });
  }

  const body = state.panel.querySelector('.wl-body');
  body.innerHTML = '';

  if (!state.ready) {
    body.innerHTML = '<div class="wl-empty">Scanning…</div>';
    return;
  }
  if (!state.entries.length) {
    body.innerHTML = `
      <div class="wl-empty">
        No words configured.<br>
        <button class="wl-link wl-edit-empty">Add some in Settings</button>
      </div>`;
    body.querySelector('.wl-edit-empty').addEventListener('click', () =>
      chrome.runtime.openOptionsPage?.()
    );
    return;
  }

  const list = document.createElement('ul');
  list.className = 'wl-list';
  for (const entry of state.entries) {
    const bucket = state.byEntry.get(entry.id) || { headings: [], body: [] };
    const total = bucket.headings.length + bucket.body.length;
    const li = document.createElement('li');
    li.className = 'wl-row';
    li.dataset.entryId = entry.id;
    if (state.activeEntryId === entry.id) li.classList.add('wl-active-row');
    if (total === 0) li.classList.add('wl-zero');

    const name = document.createElement('button');
    name.className = 'wl-row-name';
    name.title = entry.term;
    name.textContent = entry.term || '(empty)';
    name.addEventListener('click', () => activate(entry.id, 'all'));

    const counts = document.createElement('span');
    counts.className = 'wl-counts';
    if (bucket.headings.length) {
      const h = document.createElement('button');
      h.className = 'wl-badge wl-heading';
      h.textContent = `\u2605${bucket.headings.length}`;
      h.title = `${bucket.headings.length} match${bucket.headings.length === 1 ? '' : 'es'} in headings`;
      h.addEventListener('click', (e) => { e.stopPropagation(); activate(entry.id, 'headings'); });
      counts.appendChild(h);
    }
    const b = document.createElement('button');
    b.className = 'wl-badge wl-body';
    b.textContent = `\u2022${bucket.body.length}`;
    b.title = `${bucket.body.length} match${bucket.body.length === 1 ? '' : 'es'} in body text`;
    b.addEventListener('click', (e) => { e.stopPropagation(); activate(entry.id, 'body'); });
    counts.appendChild(b);

    const counter = document.createElement('span');
    counter.className = 'wl-counter';
    counter.dataset.entryId = entry.id;
    if (state.activeEntryId === entry.id && state.activeIndex >= 0) {
      const visible = getVisibleMatches(entry.id, state.activeBucket);
      counter.textContent = `${state.activeIndex + 1} of ${visible.length}`;
    }

    li.append(name, counts, counter);
    list.appendChild(li);
  }
  body.appendChild(list);
}

function getVisibleMatches(entryId, bucket) {
  const b = state.byEntry.get(entryId);
  if (!b) return [];
  if (bucket === 'headings') return b.headings;
  if (bucket === 'body') return b.body;
  return [...b.headings, ...b.body];
}

function activate(entryId, bucket) {
  const visible = getVisibleMatches(entryId, bucket);
  if (!visible.length) return;
  if (state.activeEntryId === entryId && state.activeBucket === bucket) {
    state.activeIndex = (state.activeIndex + 1) % visible.length;
  } else {
    state.activeEntryId = entryId;
    state.activeBucket = bucket;
    state.activeIndex = 0;
  }
  const match = visible[state.activeIndex];
  jumpToMatch(match);
  renderPanel();
}

async function jumpToMatch(match) {
  const app = window.PDFViewerApplication;
  clearHighlights();
  const currentPage = app.pdfViewer.currentPageNumber;
  if (currentPage !== match.pageNum) {
    app.pdfViewer.currentPageNumber = match.pageNum;
  }
  const textLayer = await waitForTextLayer(match.pageNum);
  if (!textLayer) return;
  highlightMatch(textLayer, match);
}

function waitForTextLayer(pageNum) {
  return new Promise((resolve) => {
    const app = window.PDFViewerApplication;
    const existing = getTextLayerEl(pageNum);
    if (existing && existing.childElementCount > 0) {
      resolve(existing);
      return;
    }
    const handler = (evt) => {
      if (evt.pageNumber === pageNum) {
        app.eventBus.off('textlayerrendered', handler);
        clearTimeout(timer);
        resolve(getTextLayerEl(pageNum));
      }
    };
    const timer = setTimeout(() => {
      app.eventBus.off('textlayerrendered', handler);
      resolve(getTextLayerEl(pageNum));
    }, 5000);
    app.eventBus.on('textlayerrendered', handler);
  });
}

function getTextLayerEl(pageNum) {
  const app = window.PDFViewerApplication;
  const pageView = app.pdfViewer.getPageView(pageNum - 1);
  if (!pageView) return null;
  return pageView.div.querySelector('.textLayer');
}

function getTextDivs(pageNum) {
  const app = window.PDFViewerApplication;
  const pageView = app.pdfViewer.getPageView(pageNum - 1);
  if (!pageView) return null;
  const tl = pageView.textLayer;
  if (tl && Array.isArray(tl.textDivs) && tl.textDivs.length) return tl.textDivs;
  const el = getTextLayerEl(pageNum);
  if (!el) return null;
  return Array.from(el.children).filter((n) => n.tagName === 'SPAN');
}

function highlightMatch(textLayer, match) {
  const divs = getTextDivs(match.pageNum);
  if (!divs || !divs[match.startItem]) return;

  const ranges = [];
  for (let i = match.startItem; i <= match.endItem; i++) {
    const node = divs[i];
    if (!node) continue;
    const textNode = node.firstChild;
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) continue;
    const s = i === match.startItem ? match.startChar : 0;
    const e = i === match.endItem ? match.endChar : textNode.nodeValue.length;
    if (e <= s) continue;
    const range = document.createRange();
    try {
      range.setStart(textNode, Math.min(s, textNode.nodeValue.length));
      range.setEnd(textNode, Math.min(e, textNode.nodeValue.length));
      ranges.push(range);
    } catch {}
  }
  if (!ranges.length) return;

  const marks = [];
  for (const r of ranges) {
    const mark = document.createElement('mark');
    mark.className = `${HIGHLIGHT_CLASS} ${ACTIVE_CLASS}`;
    try {
      r.surroundContents(mark);
      marks.push(mark);
    } catch {
      const span = document.createElement('span');
      span.className = `${HIGHLIGHT_CLASS} ${ACTIVE_CLASS}`;
      span.textContent = r.toString();
      r.deleteContents();
      r.insertNode(span);
      marks.push(span);
    }
  }
  if (marks[0]) {
    marks[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function clearHighlights() {
  const nodes = document.querySelectorAll(`.${HIGHLIGHT_CLASS}`);
  nodes.forEach((n) => {
    const parent = n.parentNode;
    if (!parent) return;
    while (n.firstChild) parent.insertBefore(n.firstChild, n);
    parent.removeChild(n);
    parent.normalize?.();
  });
}

function setupPanelDrag(panel) {
  const header = panel.querySelector('.wl-header');
  let dragging = false;
  let ox = 0, oy = 0;
  header.addEventListener('mousedown', (e) => {
    if (e.target.closest('.wl-btn')) return;
    dragging = true;
    const rect = panel.getBoundingClientRect();
    ox = e.clientX - rect.left;
    oy = e.clientY - rect.top;
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    panel.style.right = 'auto';
    panel.style.top = `${Math.max(0, e.clientY - oy)}px`;
    panel.style.left = `${Math.max(0, e.clientX - ox)}px`;
  });
  window.addEventListener('mouseup', () => { dragging = false; });
}

main().catch(console.error);
