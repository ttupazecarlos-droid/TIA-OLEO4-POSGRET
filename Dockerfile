# ============================================================
# TIA OLEO 4 - Imagen Node.js para PostgreSQL/Supabase
# ============================================================
FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# La app escribe las fotos en public/img cuando no usa Supabase Storage.
RUN mkdir -p public/img \
    && chown -R node:node /app

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "start"]
