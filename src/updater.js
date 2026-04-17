import { getUpdateInfo, setUpdateInfo } from './storage.js';

const REPO = 'cardosocardoso/word-looker';
const RELEASES_URL = `https://api.github.com/repos/${REPO}/releases/latest`;

export async function checkForUpdate() {
  const current = chrome.runtime.getManifest().version;
  let resp;
  try {
    resp = await fetch(RELEASES_URL, {
      headers: { Accept: 'application/vnd.github+json' },
      cache: 'no-store',
    });
  } catch (e) {
    return { ok: false, error: String(e) };
  }
  if (!resp.ok) return { ok: false, error: `HTTP ${resp.status}` };
  const data = await resp.json();
  const latestTag = (data.tag_name || '').replace(/^v/, '');
  if (!latestTag) return { ok: false, error: 'no tag_name in latest release' };
  const newer = semverGreater(latestTag, current);
  if (newer) {
    const info = {
      latestVersion: latestTag,
      currentVersion: current,
      htmlUrl: data.html_url,
      body: data.body || '',
      checkedAt: Date.now(),
    };
    await setUpdateInfo(info);
    await chrome.action.setBadgeBackgroundColor({ color: '#d9534f' });
    await chrome.action.setBadgeText({ text: '!' });
    return { ok: true, update: info };
  }
  const prev = await getUpdateInfo();
  if (prev) {
    await setUpdateInfo(null);
  }
  return { ok: true, update: null };
}

export function semverGreater(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return true;
    if (pa[i] < pb[i]) return false;
  }
  return false;
}

function parseSemver(v) {
  const parts = String(v).split('-')[0].split('.').map((n) => parseInt(n, 10));
  while (parts.length < 3) parts.push(0);
  return parts.map((n) => (Number.isFinite(n) ? n : 0));
}
