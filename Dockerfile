# syntax=docker/dockerfile:1
#
# KruSmart in a container.
#
# Three stages, so the shipped image carries neither the build toolchain nor a
# single development dependency: `deps` resolves the full tree, `builder` runs
# the Next.js build with it, `runner` installs production dependencies only and
# copies the built output across.
#
# ── TWO THINGS ABOUT THIS APP THAT A GENERIC NEXT.JS DOCKERFILE GETS WRONG ──
#
# 1. THE REPORT TEMPLATES ARE BUILD ARTEFACTS, AND THE SERVER READS THEM OFF
#    DISK. `lib/reporting/report-storage.ts` resolves them from
#    `process.cwd()/lib/reporting/templates`, and they are gitignored — they do
#    not exist in the source tree, `npm run build`'s prebuild step generates
#    them. So `runner` must copy that directory out of `builder` explicitly. Omit
#    it and the app boots perfectly, then fails on every single report with
#    "ឯកសារទម្រង់មិនមាននៅលើម៉ាស៊ីនមេទេ" — a failure that only appears when a
#    teacher tries to print something.
#
# 2. `NEXT_PUBLIC_SUPABASE_URL` IS READ FROM TWO PLACES THAT NEED TWO DIFFERENT
#    HOSTS. `lib/supabase/client.ts` runs in the browser, where the value is
#    inlined at BUILD time; `server.ts` and `middleware.ts` run inside the
#    container, where it is read from the environment at RUN time. Against a
#    local Supabase those are not the same address — the browser wants
#    127.0.0.1, the container wants host.docker.internal — which is exactly why
#    the public values arrive as build args here and the runtime value is set
#    separately in compose. See the comment there.
#
# Secrets are never baked in: `.dockerignore` excludes `.env.local`, and the
# server-only R2 credentials reach the container through `env_file` at runtime.

# ──────────────────────────────────────────────────────────── dependencies
FROM node:24-alpine AS deps
WORKDIR /app

# Lockfile-only layer: `npm ci` re-runs solely when the manifest changes, not on
# every source edit.
COPY package.json package-lock.json* ./
RUN npm ci

# ────────────────────────────────────────────────────────────────── build
FROM node:24-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Inlined into the client bundle by `next build`. These are public by
# definition — the anon key is designed to ship to browsers, and every data path
# behind it goes through RLS as the signed-in user.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_R2_PUBLIC_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_R2_PUBLIC_URL=$NEXT_PUBLIC_R2_PUBLIC_URL \
    NEXT_TELEMETRY_DISABLED=1

# Runs `prebuild` first, which is what generates the fifteen report templates.
RUN npm run build

# ───────────────────────────────────────────────────────────────── runtime
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./next.config.ts

# ★ The generated report templates. See note 1 in the header.
COPY --from=builder /app/lib/reporting/templates ./lib/reporting/templates

# Run unprivileged. `node` (uid 1000) ships with the base image; nothing here is
# written to at runtime, so no ownership changes are needed.
USER node

EXPOSE 3000

# `HOSTNAME=0.0.0.0` above is load-bearing: Next binds to localhost by default,
# which inside a container means the container's own loopback and is unreachable
# from a published port.
CMD ["npx", "next", "start"]
