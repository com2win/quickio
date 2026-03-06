FROM node:20-alpine

RUN addgroup -g 1001 quickio && adduser -u 1001 -G quickio -s /bin/sh -D quickio

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --production

COPY . .

RUN mkdir -p data public/uploads && chown -R quickio:quickio /app

USER quickio

EXPOSE 3000

CMD ["node", "server/index.js"]
