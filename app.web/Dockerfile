# --- Holiday Tracker image ---
# Node major-version tag (project policy: no :latest, no exact patch pin).
# The base image is refreshed whenever CI rebuilds, i.e. when a release is cut.
# There is deliberately no scheduled rebuild: republishing an existing version
# tag with different contents would break the guarantee that a pinned version
# is immutable, which is the whole point of pinning it in Ansible.
FROM node:24-alpine

# App directory inside the container
WORKDIR /app

# No runtime npm deps (server uses only Node built-ins), but copy manifest
# first so the layer caches and `npm start` resolves.
COPY package.json ./

# Copy application code (server + public SPA, incl. vendored chart.umd.min.js)
COPY server.js ./
COPY public ./public

# Data is written here; mounted as a volume so it survives container rebuilds.
ENV DATA_DIR=/data
ENV PORT=8100
VOLUME ["/data"]

# Drop to the built-in non-root user for safety
RUN mkdir -p /data && chown -R node:node /data /app
USER node

EXPOSE 8100
CMD ["node", "server.js"]
