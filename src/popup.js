import { getEnabled, setEnabled, getKeywords, getUpdateInfo } from './storage.js';

const el = (id) => document.getElementById(id);

async function render() {
  const manifest = chrome.runtime.getManifest();
  el('version').textContent = `v${manifest.version}`;

  const [enabled, keywords, update] = await Promise.all([
    getEnabled(),
    getKeywords(),
    getUpdateInfo(),
  ]);

  el('toggle').checked = enabled;
  el('toggleSub').textContent = enabled ? 'On — PDFs open in Word Looker viewer' : 'Off';
  el('emptyHint').hidden = keywords.length > 0;

  if (update) {
    el('updateCard').hidden = false;
    el('updateVersions').textContent = `v${update.currentVersion} → v${update.latestVersion}`;
  } else {
    el('updateCard').hidden = true;
  }
}

el('toggle').addEventListener('change', async (e) => {
  await setEnabled(e.target.checked);
  render();
});

el('openOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());
el('openOptionsHint').addEventListener('click', () => chrome.runtime.openOptionsPage());

el('checkUpdate').addEventListener('click', async () => {
  const btn = el('checkUpdate');
  const prev = btn.textContent;
  btn.textContent = 'Checking…';
  btn.disabled = true;
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'check-update-now' });
    if (resp?.ok && resp.update) {
      await render();
    } else if (resp?.ok) {
      btn.textContent = 'Up to date';
      setTimeout(() => { btn.textContent = prev; btn.disabled = false; }, 1500);
      return;
    } else {
      btn.textContent = 'Check failed';
      setTimeout(() => { btn.textContent = prev; btn.disabled = false; }, 1500);
      return;
    }
  } finally {
    btn.disabled = false;
    if (btn.textContent === 'Checking…') btn.textContent = prev;
  }
});

el('openReleaseBtn').addEventListener('click', async () => {
  const u = await getUpdateInfo();
  if (u?.htmlUrl) chrome.tabs.create({ url: u.htmlUrl });
});

el('applyUpdateBtn').addEventListener('click', async () => {
  const btn = el('applyUpdateBtn');
  const status = el('updateStatus');
  btn.disabled = true;
  status.hidden = false;
  status.textContent = 'Running git pull via native host…';
  const resp = await chrome.runtime.sendMessage({ type: 'apply-update-native' });
  if (resp?.ok) {
    status.textContent = 'Pulled. Reloading extension…';
  } else {
    status.innerHTML = `Couldn't auto-update: ${escapeHtml(resp?.error || 'unknown error')}.<br>
      Open the options page for manual update instructions.`;
    btn.disabled = false;
  }
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

chrome.storage.onChanged.addListener(() => render());
render();
