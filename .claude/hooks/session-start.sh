#!/bin/bash
set -euo pipefail

# Only run in remote (web) environments.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Install Node dependencies. postinstall downloads the showboat binary via
# curl (which respects https_proxy), since the showboat package's own install
# script uses Node's https.get() which does not honour the proxy.
pnpm install
