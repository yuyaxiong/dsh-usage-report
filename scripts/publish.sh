#!/usr/bin/env bash
# 用 Granular Access Token 发布到 npmjs。
# 本机 ~/.npmrc 的 registry 指向腾讯镜像，所以这里显式指定 registry 和 token scope。
# 用法：NPM_TOKEN=npm_xxx ./scripts/publish.sh [--dry-run]
set -euo pipefail
: "${NPM_TOKEN:?需要 NPM_TOKEN：settings → Access Tokens → Granular，勾选 Bypass two-factor authentication}"
cd "$(dirname "$0")/.."
NPM_REGISTRY=https://registry.npmjs.org
npm whoami --registry="$NPM_REGISTRY" --//registry.npmjs.org/:_authToken="$NPM_TOKEN"
npm publish --access public --registry="$NPM_REGISTRY" --//registry.npmjs.org/:_authToken="$NPM_TOKEN" "$@"
