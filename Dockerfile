# MOB Guard — Hugging Face Spaces (Docker) / any container host.
#
# Build:  docker build -t mob-guard .
# Run:    docker run -p 7860:7860 -e JWT_SECRET=<long-random> mob-guard
FROM node:20-slim

WORKDIR /app

# Install production dependencies only.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy the app (frontend + backend).
COPY . .

# Hugging Face Spaces (Docker SDK) expects the app on port 7860.
EXPOSE 7860
ENV PORT=7860 NODE_ENV=production

CMD ["node", "backend/server.js"]
