#!/bin/sh
set -eu

export API_UPSTREAM="${API_UPSTREAM:-http://host.docker.internal:8000}"

envsubst '${API_UPSTREAM}' < /etc/nginx/templates/default.conf.template \
  > /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'
