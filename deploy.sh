#!/usr/bin/env bash
set -euo pipefail

pnpm build
pnpm dlx wrangler pages deploy --branch main
