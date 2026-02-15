-- 初始化数据库架构
-- 在 Supabase SQL Editor 中执行

-- User table (NextAuth + 自定义字段)
CREATE TABLE IF NOT EXISTS "users" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT,
  "email" TEXT UNIQUE,
  "emailVerified" TIMESTAMP(3),
  "image" TEXT,
  "coins" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Account table (NextAuth OAuth)
CREATE TABLE IF NOT EXISTS "accounts" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  "refresh_token" TEXT,
  "access_token" TEXT,
  "expires_at" INTEGER,
  "token_type" TEXT,
  "scope" TEXT,
  "id_token" TEXT,
  "session_state" TEXT,
  CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "accounts_provider_providerAccountId_key" ON "accounts" ("provider", "providerAccountId");

-- Session table (NextAuth)
CREATE TABLE IF NOT EXISTS "sessions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sessionToken" TEXT NOT NULL UNIQUE,
  "userId" TEXT NOT NULL,
  "expires" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Verification Token (NextAuth)
CREATE TABLE IF NOT EXISTS "verification_tokens" (
  "identifier" TEXT NOT NULL,
  "token" TEXT NOT NULL UNIQUE,
  "expires" TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "verification_tokens_identifier_token_key" ON "verification_tokens" ("identifier", "token");

-- Purchase (支付记录)
CREATE TABLE IF NOT EXISTS "purchases" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "stripeSessionId" TEXT NOT NULL UNIQUE,
  "amount" INTEGER NOT NULL,
  "coins" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "purchases_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "purchases_userId_idx" ON "purchases" ("userId");

-- Series (剧集系列)
CREATE TABLE IF NOT EXISTS "series" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "coverUrl" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Episode (单集)
CREATE TABLE IF NOT EXISTS "episodes" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "seriesId" TEXT NOT NULL,
  "episodeNum" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "thumbnailUrl" TEXT,
  "muxAssetId" TEXT UNIQUE,
  "muxPlaybackId" TEXT UNIQUE,
  "duration" INTEGER,
  "unlockCost" INTEGER NOT NULL DEFAULT 10,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "episodes_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "series" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "episodes_seriesId_episodeNum_key" ON "episodes" ("seriesId", "episodeNum");
CREATE INDEX IF NOT EXISTS "episodes_seriesId_idx" ON "episodes" ("seriesId");

-- EpisodeUnlock (解锁记录)
CREATE TABLE IF NOT EXISTS "episode_unlocks" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "episodeId" TEXT NOT NULL,
  "coinsCost" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "episode_unlocks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "episode_unlocks_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "episodes" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "episode_unlocks_userId_episodeId_key" ON "episode_unlocks" ("userId", "episodeId");
CREATE INDEX IF NOT EXISTS "episode_unlocks_userId_idx" ON "episode_unlocks" ("userId");
CREATE INDEX IF NOT EXISTS "episode_unlocks_episodeId_idx" ON "episode_unlocks" ("episodeId");

-- WatchEvent (观看事件)
CREATE TABLE IF NOT EXISTS "watch_events" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "episodeId" TEXT NOT NULL,
  "watchPosition" INTEGER NOT NULL,
  "watchDuration" INTEGER NOT NULL,
  "completedRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "source" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "watch_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "watch_events_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "episodes" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "watch_events_userId_episodeId_idx" ON "watch_events" ("userId", "episodeId");
CREATE INDEX IF NOT EXISTS "watch_events_createdAt_idx" ON "watch_events" ("createdAt");

-- Card (卡牌)
CREATE TABLE IF NOT EXISTS "cards" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "seriesId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "rarity" TEXT NOT NULL DEFAULT 'common',
  "imageUrl" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cards_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "series" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "cards_seriesId_idx" ON "cards" ("seriesId");

-- UserCard (用户卡牌)
CREATE TABLE IF NOT EXISTS "user_cards" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "cardId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_cards_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "user_cards_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "cards" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_cards_userId_cardId_key" ON "user_cards" ("userId", "cardId");
CREATE INDEX IF NOT EXISTS "user_cards_userId_idx" ON "user_cards" ("userId");
