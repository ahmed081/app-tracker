#!/bin/sh
# Runs when the container starts (nginx image hook). Writes the runtime config
# read by the app, and optionally a reverse proxy for the API.
#   API_BASE_URL  where the browser calls the API, e.g. https://api.example.com
#                 (empty = same origin, use with API_UPSTREAM)
#   API_UPSTREAM  if set, Nginx forwards /api/ to it, e.g. http://backend:8080
set -e
HTML=/usr/share/nginx/html
mkdir -p /etc/nginx/snippets

# JSON-escape the value for config.js
esc=$(printf '%s' "${API_BASE_URL:-}" | sed 's/\\/\\\\/g; s/"/\\"/g')
printf 'window.__APP_CONFIG__ = { apiBaseUrl: "%s" };\n' "$esc" > "$HTML/config.js"

if [ -n "${API_UPSTREAM:-}" ]; then
  cat > /etc/nginx/snippets/api-proxy.inc <<CONF
location /api/ {
    proxy_pass ${API_UPSTREAM};
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_read_timeout 30s;
}
CONF
else
  : > /etc/nginx/snippets/api-proxy.inc
fi

# Allow the browser to call the API origin (Content-Security-Policy).
api_origin=$(printf '%s' "${API_BASE_URL:-}" | sed -E 's#^(https?://[^/]+).*#\1#')
sed "s#__API_ORIGIN__#${api_origin}#" /etc/nginx/snippets/security-headers.inc.template > /etc/nginx/snippets/security-headers.inc
echo "app config: apiBaseUrl='${API_BASE_URL:-}' proxy='${API_UPSTREAM:-none}'"
