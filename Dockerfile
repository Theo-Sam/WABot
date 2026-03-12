FROM node:20-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

# Runtime deps for media processing and native modules when prebuilds are unavailable.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
RUN mkdir -p /app/data /app/auth_state

CMD ["npm", "start"]
