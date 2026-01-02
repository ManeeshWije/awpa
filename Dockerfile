FROM --platform=$TARGETPLATFORM node:22-bullseye

RUN apt-get update && apt-get install -y \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
    libx11-xcb1 libxcomposite1 libxdamage1 libxrandr2 \
    libgbm1 libasound2 libpangocairo-1.0-0 \
    libgtk-3-0 libxshmfence1 wget ca-certificates \
    fonts-liberation libdrm2 libxext6 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN npx tsc

RUN npx playwright install-deps

RUN npx playwright install

CMD ["node", "dist/scrape.js"]
