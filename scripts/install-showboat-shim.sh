#!/usr/bin/env bash
# Install a Node.js shim for the showboat binary when the Go binary cannot be
# downloaded (no network access). Safe to re-run — idempotent.
#
# The showboat npm package downloads a Go binary at install time. In this
# environment there is no network, so we provide a JS implementation of the
# same CLI interface at the path the wrapper expects.

set -euo pipefail

BIN_DIR="node_modules/showboat/bin"
SHIM="$BIN_DIR/showboat"

if [ ! -d "$BIN_DIR" ]; then
  echo "install-showboat-shim: $BIN_DIR not found — run pnpm install first"
  exit 1
fi

if [ -f "$SHIM" ] && head -1 "$SHIM" | grep -q "node"; then
  echo "install-showboat-shim: shim already in place ($SHIM)"
  exit 0
fi

cat > "$SHIM" << 'SHIM_BODY'
#!/usr/bin/env node
/**
 * showboat shim — Node.js implementation for no-network environments.
 * Supports: init, note, exec, image, --version, --help
 * See _memory/knowledgeBase/reference/showboatWorkaround.md
 */
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const VERSION = '0.6.1-shim';
function appendTo(f, t) { fs.appendFileSync(f, t, 'utf8'); }
const [,,sub,...rest] = process.argv;
switch (sub) {
  case '--version': case '-v':
    console.log(VERSION); break;
  case '--help': case '-h': case undefined:
    console.log('showboat ' + VERSION + '\nCommands: init note exec image'); break;
  case 'init': {
    const [f, title = path.basename(f, path.extname(f))] = rest;
    if (!f) { console.error('showboat init: <file> required'); process.exit(1); }
    fs.writeFileSync(f, `# ${title}\n\n`, 'utf8'); break;
  }
  case 'note': {
    const [f, ...t] = rest;
    if (!f || t.length === 0) { console.error('showboat note: <file> <text> required'); process.exit(1); }
    appendTo(f, t.join(' ') + '\n\n'); break;
  }
  case 'exec': {
    const [f, shell, ...cmd] = rest;
    if (!f || !shell || cmd.length === 0) { console.error('showboat exec: <file> <shell> <cmd> required'); process.exit(1); }
    const c = cmd.join(' ');
    let out = '', code = 0;
    try { out = cp.execSync(c, { shell: true, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch (e) { out = (e.stdout || '') + (e.stderr || ''); code = e.status ?? 1; }
    appendTo(f, '```' + shell + '\n$ ' + c + '\n' + out.replace(/\n+$/, '') + '\n```\n\n');
    if (code !== 0) process.exit(code); break;
  }
  case 'image': {
    const [f, img] = rest;
    if (!f || !img) { console.error('showboat image: <file> <img-path> required'); process.exit(1); }
    appendTo(f, `![${path.basename(img, path.extname(img))}](${img})\n\n`); break;
  }
  default:
    console.error(`showboat: unknown command "${sub}"`); process.exit(1);
}
SHIM_BODY

chmod +x "$SHIM"
echo "install-showboat-shim: shim installed at $SHIM"
