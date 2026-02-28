FROM node:22-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY package.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./
# Use npm install (not npm ci) to get correct platform-specific binaries
# macOS lockfile lacks linux-x64-musl bindings for lightningcss, tailwindcss/oxide, etc.
RUN npm install
RUN npx prisma generate

# Build the application
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
ENV DIRECT_URL="postgresql://dummy:dummy@localhost:5432/dummy"
ENV STRIPE_SECRET_KEY="sk_test_dummy"
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_dummy"
ENV STRIPE_PUBLISHABLE_KEY="pk_test_dummy"
ENV GOOGLE_CLIENT_ID="dummy"
ENV GOOGLE_CLIENT_SECRET="dummy"
ENV MUX_TOKEN_ID="dummy"
ENV MUX_TOKEN_SECRET="dummy"
ENV AUTH_SECRET="dummy-secret-for-build"
ENV NEXTAUTH_SECRET="dummy-secret-for-build"
ENV NEXTAUTH_URL="http://localhost:3000"
ENV OPENROUTER_API_KEY="dummy"
RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
RUN apk add --no-cache ffmpeg python3 \
    && wget -qO /usr/local/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp
USER nextjs
EXPOSE 8080
CMD ["node", "server.js"]
