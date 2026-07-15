#!/bin/sh
set -eu

export API_UPSTREAM="${API_UPSTREAM:-http://api:8000}"
export API_KEY="${API_KEY:-}"
export HTTPS_EXTERNAL_PORT="${HTTPS_EXTERNAL_PORT:-8443}"

CERT_DIR=/etc/nginx/certs
CERT_FILE="$CERT_DIR/cert.pem"
KEY_FILE="$CERT_DIR/key.pem"

mkdir -p "$CERT_DIR"

# Self-signed TLS so HTTPS works without host-mounted / mkcert files.
# Browsers will warn once; after proceeding, isSecureContext is true (Translator API).
if [ ! -f "$CERT_FILE" ] || [ ! -f "$KEY_FILE" ]; then
  echo "Generating self-signed TLS certificate in $CERT_DIR..."
  openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
    -keyout "$KEY_FILE" \
    -out "$CERT_FILE" \
    -subj "/CN=acsa-web" \
    -addext "subjectAltName=DNS:localhost,DNS:acsa-web,IP:127.0.0.1"
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
