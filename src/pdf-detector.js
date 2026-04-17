(async () => {
  if (location.protocol.startsWith('chrome-extension')) return;

  let enabled = false;
  try {
    const r = await chrome.storage.local.get('enabled');
    enabled = r.enabled === true;
  } catch {
    return;
  }
  if (!enabled) return;

  const hijack = () => {
    const embed = document.querySelector(
      'embed[type="application/x-google-chrome-pdf"], embed[type="application/pdf"]'
    );
    if (!embed) return false;

    let target = embed.getAttribute('original-url');
    if (!target || target.startsWith('chrome-extension://')) {
      target = location.href;
    }

    const viewerUrl =
      chrome.runtime.getURL('vendor/pdfjs/web/viewer.html') +
      '?file=' +
      encodeURIComponent(target);

    location.replace(viewerUrl);
    return true;
  };

  if (hijack()) return;

  const obs = new MutationObserver(() => {
    if (hijack()) obs.disconnect();
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => obs.disconnect(), 5000);
})();
