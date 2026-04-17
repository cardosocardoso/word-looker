export const KEYS = {
  ENABLED: 'enabled',
  KEYWORDS: 'keywords',
  UPDATE_INFO: 'updateInfo',
  REPO_PATH: 'repoPath',
};

export async function getEnabled() {
  const { [KEYS.ENABLED]: v } = await chrome.storage.local.get(KEYS.ENABLED);
  return v === true;
}

export async function setEnabled(value) {
  await chrome.storage.local.set({ [KEYS.ENABLED]: !!value });
}

export async function getKeywords() {
  const { [KEYS.KEYWORDS]: v } = await chrome.storage.sync.get(KEYS.KEYWORDS);
  return Array.isArray(v) ? v : [];
}

export async function setKeywords(list) {
  await chrome.storage.sync.set({ [KEYS.KEYWORDS]: list });
}

export async function getUpdateInfo() {
  const { [KEYS.UPDATE_INFO]: v } = await chrome.storage.local.get(KEYS.UPDATE_INFO);
  return v || null;
}

export async function setUpdateInfo(info) {
  if (info) {
    await chrome.storage.local.set({ [KEYS.UPDATE_INFO]: info });
  } else {
    await chrome.storage.local.remove(KEYS.UPDATE_INFO);
  }
}

export async function getRepoPath() {
  const { [KEYS.REPO_PATH]: v } = await chrome.storage.local.get(KEYS.REPO_PATH);
  return v || '';
}

export async function setRepoPath(p) {
  await chrome.storage.local.set({ [KEYS.REPO_PATH]: p || '' });
}

export function newEntry(term) {
  return {
    id: crypto.randomUUID(),
    term: String(term || '').trim(),
    wholeWord: shouldDefaultWholeWord(term),
    headingBoost: true,
  };
}

function shouldDefaultWholeWord(term) {
  const t = String(term || '').trim();
  if (!t) return true;
  if (t.length <= 4) return true;
  if (/^[A-Z]{2,}$/.test(t)) return true;
  return false;
}
