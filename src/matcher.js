export function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function entryToRegex(entry) {
  const term = String(entry.term || '').trim();
  if (!term) return null;
  const normalized = term.replace(/\s+/g, ' ');
  const escaped = escapeRegex(normalized).replace(/ /g, '\\s+');
  const startBoundary = entry.wholeWord && /^\w/.test(normalized) ? '\\b' : '';
  const endBoundary = entry.wholeWord && /\w$/.test(normalized) ? '\\b' : '';
  return new RegExp(startBoundary + escaped + endBoundary, 'gi');
}

export function computeMedianFontSize(spans) {
  const sizes = [];
  for (const span of spans) {
    const fs = parseFloat(span.style.fontSize);
    if (Number.isFinite(fs) && fs > 0) sizes.push(fs);
  }
  if (!sizes.length) return 0;
  sizes.sort((a, b) => a - b);
  const mid = Math.floor(sizes.length / 2);
  return sizes.length % 2 ? sizes[mid] : (sizes[mid - 1] + sizes[mid]) / 2;
}

export function isHeadingSpan(span, medianSize) {
  const fs = parseFloat(span.style.fontSize);
  if (Number.isFinite(fs) && medianSize > 0 && fs >= medianSize * 1.2) return true;
  const fontName = (span.style.fontFamily || '') + ' ' + (span.dataset?.fontName || '');
  if (/bold|black|heavy/i.test(fontName)) return true;
  const weight = parseInt(span.style.fontWeight, 10);
  if (Number.isFinite(weight) && weight >= 600) return true;
  return false;
}
