# Showboat Workaround (No-Network Environments)

## Problem

`showboat` (npm package `showboat@0.6.1`) is a Go binary wrapper. During `pnpm install` it
tries to download the binary from GitHub Releases. In this environment there is no network
access, so installation always fails with:

```
Installation failed: getaddrinfo EAI_AGAIN github.com
```

## Solution

A Node.js shim was written at the expected binary path:

```
node_modules/showboat/bin/showboat
```

The shim is a `#!/usr/bin/env node` script that implements the same CLI interface
as the real Go binary. The `node_modules/.bin/showboat` wrapper (the npm shim at
`node_modules/showboat/bin/showboat.js`) finds the binary at that exact path, so
all invocations via `node_modules/.bin/showboat` work correctly.

## Re-creating the shim after pnpm install

`pnpm install` does NOT overwrite `node_modules/showboat/bin/showboat` — that path is
only created by the post-install download script, which fails silently in this environment.
The shim therefore survives re-installs. If it ever disappears, recreate it:

```bash
cat > node_modules/showboat/bin/showboat << 'SHIM'
#!/usr/bin/env node
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const VERSION = '0.6.1-shim';
function appendTo(f, t) { fs.appendFileSync(f, t, 'utf8'); }
const [,,sub,...rest] = process.argv;
switch(sub) {
  case '--version': case '-v': console.log(VERSION); break;
  case '--help': case '-h': case undefined:
    console.log('showboat '+VERSION+'\nCommands: init note exec image'); break;
  case 'init': {
    const [f, title=path.basename(f,path.extname(f))] = rest;
    fs.writeFileSync(f, `# ${title}\n\n`, 'utf8'); break;
  }
  case 'note': {
    const [f,...t] = rest;
    appendTo(f, t.join(' ')+'\n\n'); break;
  }
  case 'exec': {
    const [f, shell, ...cmd] = rest;
    const c = cmd.join(' ');
    let out='', code=0;
    try { out = cp.execSync(c,{shell:true,encoding:'utf8',stdio:['pipe','pipe','pipe']}); }
    catch(e) { out=(e.stdout||'')+(e.stderr||''); code=e.status??1; }
    appendTo(f, '```'+shell+'\n$ '+c+'\n'+out.replace(/\n+$/,'')+'\n```\n\n');
    if(code!==0) process.exit(code); break;
  }
  case 'image': {
    const [f, img] = rest;
    appendTo(f, `![${path.basename(img,path.extname(img))}](${img})\n\n`); break;
  }
  default:
    console.error('showboat: unknown command "'+sub+'"'); process.exit(1);
}
SHIM
chmod +x node_modules/showboat/bin/showboat
```

## Supported Commands

| Command | Usage | Effect |
|---------|-------|--------|
| `init`  | `showboat init <file> [title]` | Creates/overwrites file with `# title\n\n` |
| `note`  | `showboat note <file> <text>` | Appends text as a paragraph |
| `exec`  | `showboat exec <file> <shell> <cmd>` | Runs cmd, appends fenced code block with `$ cmd\noutput` |
| `image` | `showboat image <file> <img-path>` | Appends `![alt](img-path)` |
| `--version` | | Prints `0.6.1-shim` |

## Usage in the Verification Workflow

Use exactly as documented in `memory.md`:

```bash
node_modules/.bin/showboat init demos/task-NN.md "Task title"
node_modules/.bin/showboat note demos/task-NN.md "Context..."
node_modules/.bin/showboat exec demos/task-NN.md bash "pnpm test 2>&1 | tail -8"
node_modules/.bin/showboat note demos/task-NN.md "Ready for review."
```

### Note on embedded newlines in `note` text

The shell does not interpret `\n` in single-quoted strings. Keep each `note` call to a
single paragraph of prose. For multi-section demos, use multiple `note` + `exec` calls.
