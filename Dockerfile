FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./
COPY prisma ./prisma/

RUN npm install
RUN npx prisma generate

COPY src ./src/
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY prisma ./prisma/
RUN npx prisma generate
RUN npx prisma db push

COPY --from=builder /app/dist ./dist

EXPOSE 4000
ENV PORT=4000
ENV NODE_ENV=production

CMD ["npm", "start"]
