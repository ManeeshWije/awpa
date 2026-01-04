FROM --platform=$TARGETPLATFORM node:22-bullseye

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN npx tsc

RUN npx playwright install-deps

RUN npx playwright install

CMD ["node", "dist/scrape.js"]
