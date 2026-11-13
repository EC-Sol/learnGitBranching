# LearnGitBranching — Offline Standalone Release

Run LearnGitBranching without a network connection from a single HTML file. Perfect for air-gapped machines, classrooms, workshops, USB distribution, and restricted intranets.

## Downloads

| File | Size | Best for |
|---|---|---|
| `learnGitBranching-standalone.html` | ~5.0 MB | Maximum browser compatibility |
| `learnGitBranching-standalone.min.html` | ~2.9 MB | Smaller download, modern browsers only |

Grab either file from the [release assets](https://github.com/EC-Sol/learnGitBranching-offline-standalone/releases) below (or build it yourself — see [Building from source](#building-from-source)).

## What's inside

- **One file, zero network requests.** The entire app — all 36 levels, the sandbox, and all 27 UI languages — is bundled and inlined into a single self-contained HTML page.
- **Works from `file://`.** Just double-click the file. No server, no install, no internet.
- **Gzip self-extracting variant.** The `.min.html` variant stores its JS/CSS payloads gzipped and decompresses them in-browser using the native `DecompressionStream` API at startup.
- **Fonts & favicon inlined as base64 data URIs** (woff2/woff, legacy ttf/eot/svg fallbacks dropped).
- **Privacy-friendly.** Google Analytics and the promotional banner have been stripped from the offline build.

## Requirements

| Variant | Browsers |
|---|---|
| `standalone.html` | Any modern browser |
| `standalone.min.html` | Chrome/Edge 103+, Firefox 113+, Safari 16.4+ (`DecompressionStream`) |

## Usage

1. Download one of the HTML files.
2. Double-click it (or open it with your browser).
3. Learn git. Progress is saved in your browser's localStorage.

## Offline limitations

The following web-only features do not work offline: gist-based level import, shareable permalinks, and external links (GitHub, promos). All core learning features — levels, sandbox, undo/reset, git golf scoring, and language switching — work exactly as online.

## Building from source

```bash
yarn install
yarn build:singlefile   # outputs build-singlefile/*.html
```

See [OFFLINE_STANDALONE.md](OFFLINE_STANDALONE.md) for the full packaging guide, internals, troubleshooting, and customization (e.g. trimming locales to shrink the file).

