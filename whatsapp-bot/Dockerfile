FROM node:20-slim

RUN apt-get update && apt-get install -y \
  git \
  openssl \
  ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY bot.js .

EXPOSE 3000

CMD ["node", "bot.js"]
