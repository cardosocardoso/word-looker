import { KEYS, getEnabled, getUpdateInfo } from './storage.js';
import { checkForUpdate } from './updater.js';

const DNR_RULE_ID = 1;
const UPDATE_ALARM = 'update-check';
const NATIVE_HOST = 'com.wordlooker.host';

function viewerRedirectRule() {
  const viewer = chrome.runtime.getURL('vendor/pdfjs/web/viewer.html');
  return {
    id: DNR_RULE_ID,
    priority: 1,
    action: {
      type: 'redirect',
      redirect: { regexSubstitution: `${viewer}?file=\\0` },
    },
    condition: {
      regexFilter: '^(https?|file)://[^#?]*\\.pdf(\\?[^#]*)?(#.*)?$',
      resourceTypes: ['main_frame', 'sub_frame'],
    },
  };
}

async function applyToggleState() {
  const on = await getEnabled();
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing.map((r) => r.id);
  const addRules = on ? [viewerRedirectRule()] : [];
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
  await updateBadge();
}

async function updateBadge() {
  const [on, update] = await Promise.all([getEnabled(), getUpdateInfo()]);
  if (update) {
    await chrome.action.setBadgeBackgroundColor({ color: '#d9534f' });
    await chrome.action.setBadgeText({ text: '!' });
    return;
  }
  await chrome.action.setBadgeBackgroundColor({ color: '#1d76a4' });
  await chrome.action.setBadgeText({ text: on ? 'ON' : '' });
}

chrome.runtime.onInstalled.addListener(async (details) => {
  await applyToggleState();
  chrome.alarms.create(UPDATE_ALARM, { delayInMinutes: 1, periodInMinutes: 360 });
  if (details.reason === 'install') {
    chrome.runtime.openOptionsPage();
  }
});

chrome.runtime.onStartup.addListener(async () => {
  await applyToggleState();
  chrome.alarms.create(UPDATE_ALARM, { delayInMinutes: 1, periodInMinutes: 360 });
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area === 'local' && (changes[KEYS.ENABLED] || changes[KEYS.UPDATE_INFO])) {
    if (changes[KEYS.ENABLED]) await applyToggleState();
    else await updateBadge();
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === UPDATE_ALARM) {
    await checkForUpdate();
    await updateBadge();
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      switch (msg?.type) {
        case 'check-update-now': {
          const r = await checkForUpdate();
          await updateBadge();
          sendResponse(r);
          return;
        }
        case 'apply-update-native': {
          const r = await applyUpdateViaNative();
          sendResponse(r);
          return;
        }
        case 'reload-extension': {
          chrome.runtime.reload();
          sendResponse({ ok: true });
          return;
        }
        default:
          sendResponse({ ok: false, error: 'unknown message type' });
      }
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
  })();
  return true;
});

function applyUpdateViaNative() {
  return new Promise((resolve) => {
    let port;
    try {
      port = chrome.runtime.connectNative(NATIVE_HOST);
    } catch (e) {
      resolve({ ok: false, error: `native host unavailable: ${e}` });
      return;
    }
    const timeout = setTimeout(() => {
      try { port.disconnect(); } catch {}
      resolve({ ok: false, error: 'native host timeout (30s)' });
    }, 30000);
    port.onMessage.addListener((response) => {
      clearTimeout(timeout);
      try { port.disconnect(); } catch {}
      if (response?.ok) {
        resolve({ ok: true, detail: response });
        setTimeout(() => chrome.runtime.reload(), 500);
      } else {
        resolve({ ok: false, error: response?.error || 'unknown native host error' });
      }
    });
    port.onDisconnect.addListener(() => {
      clearTimeout(timeout);
      const err = chrome.runtime.lastError;
      if (err) resolve({ ok: false, error: err.message });
    });
    port.postMessage({ action: 'pull' });
  });
}

applyToggleState().catch(console.error);
