FROM node:20-bookworm

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    git build-essential ca-certificates \
 && rm -rf /var/lib/apt/lists/*

RUN git clone --depth=1 https://github.com/berkeley-abc/abc.git /tmp/abc \
 && make -C /tmp/abc \
 && cp /tmp/abc/abc /usr/local/bin/abc \
 && chmod +x /usr/local/bin/abc \
 && rm -rf /tmp/abc

COPY backend/package*.json ./backend/
WORKDIR /app/backend
RUN npm ci --omit=dev

WORKDIR /app
COPY backend ./backend

ENV NODE_ENV=production
ENV ABC_BINARY=/usr/local/bin/abc

EXPOSE 3000
CMD ["npm", "run", "start", "--prefix", "backend"]
