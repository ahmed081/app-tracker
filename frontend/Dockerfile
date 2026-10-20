# Build the static app, then serve it with Nginx. The API address is set at
# container start (API_BASE_URL / API_UPSTREAM), so one image fits any backend.
FROM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/security-headers.inc /etc/nginx/snippets/security-headers.inc.template
COPY deploy/40-app-config.sh /docker-entrypoint.d/40-app-config.sh
RUN chmod +x /docker-entrypoint.d/40-app-config.sh
COPY --from=build /src/dist /usr/share/nginx/html
EXPOSE 80
