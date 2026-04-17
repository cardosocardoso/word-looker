# Word Looker

A Chrome extension that finds and iterates through recurring words or phrases inside PDFs.
When the overlay is on, PDFs open in a bundled PDF.js viewer and a floating panel shows each
configured term with a per-bucket match count (headings / body). Click a row to jump through
matches like a per-term <kbd>Ctrl</kbd>+<kbd>F</kbd>.

- Per-entry **whole-word** matching (avoids `AHP` matching `graph`).
- Per-entry **heading boost** — matches in bold or larger-font runs surface first.
- Drag to reorder — the list order is the display priority.
- Keyword list syncs across your signed-in Chromes via `chrome.storage.sync`.
- Self-updates from GitHub Releases with one click (optional native host).

## Install

1. Clone this repo somewhere stable (this path will be used for updates):

   ```sh
   git clone https://github.com/cardosocardoso/word-looker.git
   cd word-looker
   ```

2. Open `chrome://extensions` in Chrome.
3. Toggle **Developer mode** on (top-right).
4. Click **Load unpacked** and select the `word-looker` folder.
5. On the extension's card, enable **Allow access to file URLs** so local `file://*.pdf`
   files also get the overlay.
6. Pin the toolbar icon. The options page will open automatically on first install — add
   your words and phrases there.

## Using it

- Click the toolbar icon → toggle **PDF overlay** on. The badge shows `ON`.
- Open any `.pdf` URL (web or local). The extension redirects it to the bundled viewer and
  shows the floating panel in the top-right.
- Click a row name → iterate all matches (headings first, then body).
- Click the `★N` badge → iterate only heading matches.
- Click the `•N` badge → iterate only body matches.
- Drag the panel header to move it. Use the `–` button to collapse.

## Updates

The extension polls `https://api.github.com/repos/cardosocardoso/word-looker/releases/latest`
every 6 hours (and on demand from the popup). When a newer `tag_name` is found, a red `!`
badge appears.

### Option A — one-click via native host (recommended)

One-time setup:

```sh
cd /path/to/word-looker
./scripts/install-native-host.sh <EXTENSION_ID>
```

`<EXTENSION_ID>` is the 32-character id shown on the extension's card in
`chrome://extensions` (visible after "Load unpacked").

Also set the **Local repo path** in the extension's options page to that same
`/path/to/word-looker` — the options page shows the exact install command for you.

From then on, when an update is available, the popup's **Install update** button will:
1. Ask the native host to run `git -C <repo> pull --ff-only`.
2. On success, call `chrome.runtime.reload()` so the new version takes effect immediately.

### Option B — manual

Without the native host, the popup will still notify you of updates. To apply:

```sh
cd /path/to/word-looker
git pull
```

Then click **Reload** on the extension's card in `chrome://extensions`.

## How matching works

Each entry you add in the options page becomes one case-insensitive regex:

- Internal whitespace is normalized to `\s+` so `hydrogen  peroxide` still matches.
- Regex metacharacters in your term are escaped.
- If **whole word** is on, the pattern is wrapped with `\b…\b` at word-character boundaries.
- If **heading boost** is on, matches inside a PDF.js text run whose font size is ≥ 1.2× the
  page's median, or whose font family name contains `Bold`/`Black`/`Heavy`, are tagged as
  heading matches and iterated first when you click the row name.

## Repo layout

```
manifest.json
src/              # service worker, popup, options, overlay, matcher, storage, updater
vendor/pdfjs/     # prebuilt pdf.js 4.10.38 viewer + build
rules/            # (unused; DNR rules are added dynamically at runtime)
icons/            # 16/32/48/128 png
scripts/          # native host + install script + icon generator
```

## Privacy

- No tracking, no analytics, no remote calls except the GitHub Releases API (update check).
- Your keyword list lives only in your browser's `chrome.storage.sync`, which is synced
  across your own signed-in Chrome browsers by Google's sync service and not visible to
  anyone else.
- The PDF viewer is fully local (vendored PDF.js), so PDFs are not uploaded anywhere.

## License

MIT — see [LICENSE](LICENSE).

## Credits

- [PDF.js](https://github.com/mozilla/pdf.js) by Mozilla (Apache 2.0), vendored under
  `vendor/pdfjs/`.
