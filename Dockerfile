# Single image used by both `web` and `mp` services in docker-compose.yml.
# The compose file overrides the CMD for the multiplayer service.
FROM node:20-alpine

WORKDIR /app

# Install only production deps using the lockfile (cacheable layer)
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy the rest of the project (Dockerfile + .dockerignore exclude secrets)
COPY . .

# Default port for server.js (mp container also listens but on a different port)
EXPOSE 5181 5182

# server.js by default — overridden in docker-compose for the mp service
CMD ["node", "server.js"]
