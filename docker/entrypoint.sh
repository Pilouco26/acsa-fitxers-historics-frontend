#!/bin/sh
set -eu

export API_UPSTREAM="${API_UPSTREAM:-http://api:8000}"
export API_KEY="${API_KEY:-}"

# Runtime config for the SPA (Vite env vars are fixed at image build time).
escape_js() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

API_KEY_ESCAPED="$(escape_js "$API_KEY")"
cat > /usr/share/nginx/html/config.js <<EOF
window.__ACSA_CONFIG__ = {
  apiKey: "${API_KEY_ESCAPED}"
};
EOF

envsubst '${API_UPSTREAM}' < /etc/nginx/templates/default.conf.template \
  > /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'
