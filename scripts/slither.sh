#!/usr/bin/env bash
slither flattened --solc-disable-warnings --exclude-informational --print human-summary 2>&1 | cat > secured-finance-slither.txt