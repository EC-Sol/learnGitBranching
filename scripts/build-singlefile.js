/**
 * Offline standalone single-file packaging.
 *
 * Runs the standalone Vite build (vite.singlefile.config.mjs) and post-processes
 * the emitted page into ONE self-contained HTML file:
 *
 *   1. Inline the `<script type="module" src=...>` and every
 *      `<link rel="stylesheet" href=...>` with their file contents.
 *   2. Inline referenced font files (webfonts + legacy fontawesome) as base64
 *      data URIs, dropping the ttf/eot/svg fallbacks to keep the file small.
 *   3. Inline the favicon as a data URI.
 *   4. Strip Google Analytics and the upsell banner script (network-only
 *      features that are meaningless offline; the hidden upsell markup stays
 *      but can never be shown since the script that reveals it is removed).
 *
 * The result is written to build-singlefile/learnGitBranching-standalone.html
 * and works when opened directly via file:// with zero network requests.
 *
 * Usage:  yarn build:singlefile
 */
const { spawnSync } = require('child_process');
const { existsSync, readFileSync, statSync, writeFileSync } = require('fs');
const { join, resolve } = require('path');
const zlib = require('zlib');

const rootDir = join(__dirname, '..');
const buildDir = join(rootDir, 'build-singlefile');
const assetsDir = join(rootDir, 'assets');
const outputFile = join(buildDir, 'learnGitBranching-standalone.html');
const compressedFile = join(buildDir, 'learnGitBranching-standalone.min.html');

const MIME_BY_EXT = {
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
};

function die(message) {
  console.error('[build-singlefile] ERROR: ' + message);
  process.exit(1);
}

function run(command, args) {
  console.log('[build-singlefile] $ ' + command + ' ' + args.join(' '));
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    die('command failed with exit code ' + result.status);
  }
}

function toBase64Uri(filePath) {
  const normalized = resolve(filePath);
  const ext = normalized.slice(normalized.lastIndexOf('.')).toLowerCase();
  const mime = MIME_BY_EXT[ext] || 'application/octet-stream';
  return 'data:' + mime + ';base64,' + readFileSync(filePath).toString('base64');
}

// Resolve a url() / href target against the build output first, then the
// source assets/ directory (vite does not copy assets/ in this build).
function resolveAsset(url) {
  const clean = url.split('?')[0].split('#')[0];
  const rel = clean.replace(/^\.?\//, '');
  const stripped = rel.replace(/^assets\//, '');
  const candidates = [
    join(buildDir, rel),
    join(buildDir, 'assets', rel),
    join(buildDir, 'assets', stripped),
    join(rootDir, rel),
    join(assetsDir, stripped),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

// `</script>` inside an inlined JS blob would close the tag early. Escaping
// the slash is a no-op for JS string/regex semantics and neutral in comments.
function safeForInlineScript(code) {
  return code.replace(/<\/script/gi, '<\\/script');
}

function safeForInlineStyle(css) {
  return css.replace(/<\/style/gi, '<\\/style');
}

// Drop secondary font format fallbacks (ttf/eot/svg) from `src:` lists so we
// only embed the compact woff/woff2 files.
function dropRasterFontFallbacks(css) {
  return css
    // e.g. `,url(/assets/webfonts/fa-solid-900.ttf) format("truetype")`
    .replace(
      /,\s*url\((['"]?)[^'")]*\.(?:ttf|eot|svg)(?:\?[^'")]+)?\1\)\s*format\((['"]?)[^'"]+\2\)/gi,
      ''
    )
    // e.g. `src: url('/assets/font/fontawesome-webfont.eot');` (v4-only line)
    .replace(/src:\s*url\((['"]?)[^'")]*\.eot(?:\?[^'")]+)?\1\)\s*;/gi, '')
    // e.g. `src: url('...eot?#iefix') format('eot'), ...` (v4 list leading item)
    .replace(
      /(src:\s*)url\((['"]?)[^'")]*\.eot(?:\?[^'")]+)?\2\)\s*format\((['"]?)[^'"]+\3\)\s*,\s*/gi,
      '$1'
    );
}

function main() {
  if (!existsSync(join(rootDir, 'node_modules'))) {
    die('node_modules is missing. Run `yarn install` first.');
  }

  // 1. Regenerate level/locale manifests (same as the repo's prebuild hook).
  run(process.execPath, [join(rootDir, 'scripts', 'generate.js')]);

  // 2. Vite standalone build (single JS chunk, no code splitting).
  run(process.execPath, [
    join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js'),
    'build',
    '--config',
    join(rootDir, 'vite.singlefile.config.mjs'),
  ]);

  // 3. Post-process index.html into a single self-contained file.
  let html = readFileSync(join(buildDir, 'index.html'), 'utf8');

  html = stripRemoteScripts(html);

  // Inline stylesheets: <link rel="stylesheet" ... href="...">
  html = html.replace(/<link\b[^>]*>/gi, function(tag) {
    if (!/rel="stylesheet"/i.test(tag)) {
      // favicon -> data URI
      const iconHref = tag.match(/href="([^"]+)"/);
      if (/rel="icon"/i.test(tag) && iconHref) {
        const filePath = resolveAsset(iconHref[1]);
        if (!filePath) die('favicon not found: ' + iconHref[1]);
        return '<link rel="icon" href="' + toBase64Uri(filePath) + '" type="image/x-icon">';
      }
      return tag;
    }
    const href = tag.match(/href="([^"]+)"/);
    if (!href) die('stylesheet link without href: ' + tag);
    const filePath = resolveAsset(href[1]);
    if (!filePath) die('stylesheet not found: ' + href[1]);
    let css = readFileSync(filePath, 'utf8');
    css = inlineCssUrls(dropRasterFontFallbacks(css));
    return '<style>\n' + safeForInlineStyle(css) + '\n</style>';
  });

  // Inline the module script(s): <script type="module" src="...">
  html = html.replace(/<script\b[^>]*src="[^"]*"[^>]*>\s*<\/script>/gi, function(tag) {
    const src = tag.match(/src="([^"]+)"/);
    const filePath = resolveAsset(src[1]);
    if (!filePath) die('script not found: ' + src[1]);
    const attrs = tag.slice(tag.indexOf('<script'), tag.indexOf('>')).replace(/\ssrc="[^"]*"/, '');
    const js = readFileSync(filePath, 'utf8');
    return attrs + '>\n' + safeForInlineScript(js) + '\n</script>';
  });

  // 4. Verify the result is truly self-contained.
  const problems = verify(html);
  if (problems.length) {
    die('verification failed:\n  - ' + problems.join('\n  - '));
  }

  writeFileSync(outputFile, html);
  const sizeMb = (statSync(outputFile).size / (1024 * 1024)).toFixed(2);
  console.log('');
  console.log('[build-singlefile] Done: ' + outputFile + ' (' + sizeMb + ' MB)');

  // 5. Additionally emit a gzip self-extracting variant (~60% smaller).
  const compressed = buildCompressedVariant(html);
  const compressedProblems = verifyCompressed(compressed.html, compressed.cssCount);
  if (compressedProblems.length) {
    die('compressed variant verification failed:\n  - ' + compressedProblems.join('\n  - '));
  }
  writeFileSync(compressedFile, compressed.html);
  const sizeMin = (statSync(compressedFile).size / (1024 * 1024)).toFixed(2);
  console.log('[build-singlefile] Done: ' + compressedFile + ' (' + sizeMin + ' MB)');
  console.log('[build-singlefile] Open either file directly in a browser — fully offline.');
}

// ---------------------------------------------------------------------------
// Gzip self-extracting variant
//
// HTTP `Content-Encoding` does not apply to file:// pages, so instead the big
// inlined blobs are gzipped + base64'd and a tiny bootstrap decodes them at
// runtime with the browser-native DecompressionStream API:
//   - CSS payloads are re-injected as <style> elements,
//   - the JS payload is imported as a module via a blob: URL (with an eval
//     fallback should blob: module import be unavailable).
// ---------------------------------------------------------------------------

const MIN_STYLE_SIZE = 8192; // only compress style blocks larger than this

function gzipBase64(text) {
  return zlib.gzipSync(Buffer.from(text, 'utf8'), { level: 9 }).toString('base64');
}

const COMPRESSED_LOADER = [
  '<script>',
  '(function () {',
  "  'use strict';",
  '  var CSS_PAYLOADS = __CSS_PAYLOADS__;',
  '  var JS_PAYLOAD = __JS_PAYLOAD__;',
  '  function fail(message) {',
  '    try {',
  "      var host = document.getElementById('appLoading') || document.body;",
  '      var box = document.createElement("div");',
  "      box.style.cssText = 'position:fixed;inset:0;z-index:999999;background:#2d2d2d;color:#eee;font:14px/1.6 monospace;padding:24px;white-space:pre-wrap;';",
  '      box.textContent = message;',
  '      host.appendChild(box);',
  '    } catch (e) {}',
  '  }',
  "  if (typeof DecompressionStream === 'undefined') {",
  "    fail('This standalone file is gzip-compressed and requires a modern browser\\n' +",
  "      '(Chrome/Edge 103+, Firefox 113+, Safari 16.4+).\\n' +",
  "      'Alternatively, use the uncompressed learnGitBranching-standalone.html.');",
  '    return;',
  '  }',
  '  function inflate(b64) {',
  '    var bytes = Uint8Array.from(atob(b64), function (c) { return c.charCodeAt(0); });',
  "    var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));",
  '    return new Response(stream).text();',
  '  }',
  '  Promise.all(CSS_PAYLOADS.map(inflate)).then(function (styles) {',
  '    styles.forEach(function (css) {',
  '      var tag = document.createElement("style");',
  '      tag.textContent = css;',
  '      document.head.appendChild(tag);',
  '    });',
  '    return inflate(JS_PAYLOAD);',
  '  }).then(function (js) {',
  '    var url = URL.createObjectURL(new Blob([js], { type: "text/javascript" }));',
  '    return import(url).then(function () { URL.revokeObjectURL(url); });',
  '  }).catch(function (e) {',
  '    try {',
  '      // Fallback: blob: module imports may be blocked on some setups.',
  '      // The single-chunk bundle has no static imports left, so plain eval',
  '      // preserves behavior.',
  '      // eslint-disable-next-line no-eval',
  '      (0, eval)(js);',
  '    } catch (e2) {',
  "      fail('Failed to decompress the standalone payload: ' + e);",
  '    }',
  '  });',
  '}());',
  '</script>',
].join('\n');

function buildCompressedVariant(html) {
  const cssPayloads = [];
  // Replace large inlined <style> blocks with compressed payloads (small
  // hand-written inline styles from the source markup are left untouched).
  html = html.replace(/<style>([\s\S]*?)<\/style>/g, function(match, css) {
    if (css.length < MIN_STYLE_SIZE) return match;
    cssPayloads.push(css);
    return '<!-- [standalone.min] css payload ' + (cssPayloads.length - 1) + ' -->';
  });

  // Replace the inlined module script with the self-extracting bootstrap.
  const moduleScript = html.match(/<script type="module"[^>]*>([\s\S]*?)<\/script>/);
  if (!moduleScript) die('compressed variant: module script not found');
  // Undo the </script escaping done for the uncompressed variant.
  const js = moduleScript[1].replace(/<\\\/script/gi, '</script');
  const loader = COMPRESSED_LOADER
    .replace('__CSS_PAYLOADS__', JSON.stringify(cssPayloads.map(gzipBase64)))
    .replace('__JS_PAYLOAD__', JSON.stringify(gzipBase64(js)));
  html = html.replace(moduleScript[0], loader);

  return { html: html, cssCount: cssPayloads.length };
}

function verifyCompressed(html, cssCount) {
  const problems = [];
  if (/<script type="module"/i.test(html)) problems.push('uncompressed module script remains');
  if (!html.includes('DecompressionStream')) problems.push('bootstrap loader missing');
  if (!/"[A-Za-z0-9+/=]{100000,}"/.test(html)) problems.push('JS payload missing/too small');
  const placeholders = (html.match(/\[standalone\.min\] css payload \d+/g) || []).length;
  if (placeholders !== cssCount) {
    problems.push('CSS payload count mismatch: ' + placeholders + ' != ' + cssCount);
  }
  return problems;
}

// Replace every remaining url(...) pointing at a local asset with a data URI.
function inlineCssUrls(css) {
  return css.replace(/url\((['"]?)([^'")]+)\1\)/g, function(match, quote, url) {
    if (/^(?:[a-z][a-z0-9+.-]*:|data:|#|\/\/)/i.test(url)) {
      return match; // absolute URL / data URI / fragment: leave as-is
    }
    const filePath = resolveAsset(url);
    if (!filePath) {
      die('CSS references a missing asset: ' + url);
    }
    return 'url("' + toBase64Uri(filePath) + '")';
  });
}

function stripRemoteScripts(html) {
  // GA loader + inline gtag config
  let out = html.replace(
    /<!--\s*Google tag \(gtag\.js\)\s*-->\s*<script async src="https:\/\/www\.googletagmanager\.com[^"]*"[^>]*>\s*<\/script>\s*/i,
    ''
  );
  // Any plain inline <script> that configures gtag or renders the upsell.
  out = out.replace(/<script>([\s\S]*?)<\/script>/gi, function(match, body) {
    if (/dataLayer|gtag\(|upsellDismissedAt/.test(body)) {
      return '<!-- [standalone] remote-only script removed -->';
    }
    return match;
  });
  return out;
}

function verify(html) {
  // Scan only the real HTML shell: the inlined JS/CSS blobs legitimately
  // contain attribute-like strings (e.g. `href="`+e+`"` in minified code).
  const shell = html
    .replace(/<script type="module"[^>]*>[\s\S]*?<\/script>/g, '')
    .replace(/<style>[\s\S]*?<\/style>/g, '');
  const problems = [];
  if (/<script[^>]*src=/i.test(shell)) problems.push('external <script src> remains');
  if (/<link[^>]*rel="stylesheet"[^>]*>/i.test(shell)) problems.push('external stylesheet link remains');
  if (/googletagmanager\.com/i.test(shell)) problems.push('Google Analytics reference remains');
  if (/upsellDismissedAt/i.test(shell)) problems.push('upsell script remains');
  if (/url\((['"]?)\.?\/?assets\//i.test(shell)) problems.push('un-inlined url(assets/...) reference remains');
  // No dangling relative src/href to files (links like # or https are fine).
  const relRefs = shell.match(/\s(?:src|href)="(?!data:|#|https?:|javascript:|mailto:)[^"]+"/gi) || [];
  if (relRefs.length) {
    problems.push('relative file references remain: ' + relRefs.slice(0, 5).join(', '));
  }
  return problems;
}

main();