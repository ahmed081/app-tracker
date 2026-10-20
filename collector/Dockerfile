FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY db ./db
COPY src ./src
USER node
CMD ["node", "src/cli.js", "run"]
