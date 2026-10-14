#!/bin/sh
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Node.js is not installed. Get it from https://nodejs.org"; exit 1; }
(sleep 2; (xdg-open http://localhost:3000 || open http://localhost:3000) >/dev/null 2>&1) &
node server.js
