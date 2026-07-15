#!/bin/sh
set -eu

export API_UPSTREAM="${API_UPSTREAM:-http://api:8000}"
export API_KEY="${API_KEY:-}"
export HTTPS_EXTERNAL_PORT="${HTTPS_EXTERNAL_PORT:-8443}"

CERT_FILE=/etc/nginx/certs/cert.pem
KEY_FILE=/etc/nginx/certs/key.pem

if [ ! -f "$CERT_FILE" ] || [ ! -f "$KEY_FILE" ]; then
  echo "ERROR: TLS certs missing. Expected:" >&2
  echo "  $CERT_FILE" >&2
  echo "  $KEY_FILE" >&2
  echo "On the host, run:  powershell -File scripts/setup-mkcert.ps1" >&2
  exit 1
fi

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

envsubst '${API_UPSTREAM} ${HTTPS_EXTERNAL_PORT}' \
  < /etc/nginx/templates/default.conf.template \
  > /etc/nginx/conf.d/default.conf

nginx -t
exec nginx -g 'daemon off;'
