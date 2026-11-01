#!/usr/bin/env bash
# Seed the vinyl index from your own machine.
#
#   ./scripts/seed-local.sh                      # seeds/albums.example.json
#   ./scripts/seed-local.sh --file my-list.json --augment
#   ./scripts/seed-local.sh --artist "Amaarae" --tag "afrobeats" --limit 50
#   ./scripts/seed-local.sh --docker             # start MongoDB Atlas Local first
#
# Any flag other than --docker is passed straight to scripts/seed-covers.ts
# (see `npm run vinyl:seed -- --help` style flags in that file's header).
#
# Database:
#   - DATABASE_URL in .env pointing at MongoDB Atlas (recommended), or
#   - --docker: runs the `mongodb/mongodb-atlas-local` image on port 27018,
#     which supports $vectorSearch locally, and writes DATABASE_URL for you.
set -euo pipefail

cd "$(dirname "$0")/.."

ATLAS_LOCAL_IMAGE="mongodb/mongodb-atlas-local:8.0"
ATLAS_LOCAL_NAME="algorhythm-atlas-local"
ATLAS_LOCAL_PORT=27018

use_docker=false
seed_args=()
for arg in "$@"; do
  if [[ "$arg" == "--docker" ]]; then use_docker=true; else seed_args+=("$arg"); fi
done
if [[ ${#seed_args[@]} -eq 0 ]]; then
  seed_args=(--file seeds/albums.example.json --augment)
fi

say() { printf '\033[1;35m[seed-local]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[seed-local]\033[0m %s\n' "$*" >&2; exit 1; }

# --- prerequisites -----------------------------------------------------------
command -v node >/dev/null || die "Node.js 20.6+ is required (https://nodejs.org)."
node_major=$(node -p 'process.versions.node.split(".")[0]')
(( node_major >= 20 )) || die "Node.js 20.6+ is required, found $(node -v)."

[[ -f .env ]] || { cp .env.example .env; say "Created .env from .env.example. Fill it in."; }

# Install when node_modules is missing OR stale (package-lock.json changed
# since the last install, e.g. after pulling a branch that added tsx).
if [[ ! -f node_modules/.package-lock.json || package-lock.json -nt node_modules/.package-lock.json ]]; then
  say "Installing dependencies…"
  PUPPETEER_SKIP_DOWNLOAD=1 npm install
fi

# Read a key from .env without sourcing the whole file.
env_get() { grep -E "^$1=" .env | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }
env_set() {
  local key=$1 value=$2
  if grep -qE "^$key=" .env; then
    sed -i.bak -E "s|^$key=.*|$key=\"$value\"|" .env && rm -f .env.bak
  else
    printf '%s="%s"\n' "$key" "$value" >> .env
  fi
}

# --- database ----------------------------------------------------------------
if $use_docker; then
  command -v docker >/dev/null || die "--docker needs Docker Desktop / docker engine."
  if ! docker ps --format '{{.Names}}' | grep -qx "$ATLAS_LOCAL_NAME"; then
    if docker ps -a --format '{{.Names}}' | grep -qx "$ATLAS_LOCAL_NAME"; then
      say "Starting existing $ATLAS_LOCAL_NAME container…"
      docker start "$ATLAS_LOCAL_NAME" >/dev/null
    else
      say "Starting MongoDB Atlas Local ($ATLAS_LOCAL_IMAGE) on :$ATLAS_LOCAL_PORT…"
      docker run -d --name "$ATLAS_LOCAL_NAME" -p "$ATLAS_LOCAL_PORT:27017" \
        "$ATLAS_LOCAL_IMAGE" >/dev/null
    fi
  fi
  say "Waiting for the database to report healthy…"
  for _ in $(seq 1 60); do
    status=$(docker inspect -f '{{.State.Health.Status}}' "$ATLAS_LOCAL_NAME" 2>/dev/null || echo starting)
    [[ "$status" == "healthy" ]] && break
    sleep 2
  done
  [[ "$status" == "healthy" ]] || die "Atlas Local did not become healthy (docker logs $ATLAS_LOCAL_NAME)."
  env_set DATABASE_URL "mongodb://127.0.0.1:$ATLAS_LOCAL_PORT/algorhythm?directConnection=true"
  env_set VECTOR_SEARCH_MODE "atlas"
fi

db_url=$(env_get DATABASE_URL || true)
[[ -n "${db_url:-}" ]] || die "Set DATABASE_URL in .env (Atlas connection string), or rerun with --docker."

if [[ -z "$(env_get SPOTIFY_CLIENT_ID || true)" ]]; then
  say "SPOTIFY_CLIENT_ID not set: albums will be seeded without Spotify links."
  say "Get credentials at https://developer.spotify.com/dashboard and add them to .env."
fi

# --- schema + vector index ---------------------------------------------------
say "Pushing Prisma schema…"
npx prisma db push --skip-generate
npx prisma generate >/dev/null

mode=$(env_get VECTOR_SEARCH_MODE || true)
if [[ "${mode:-atlas}" != "local" ]]; then
  say "Creating/updating the Atlas vector index…"
  npm run -s vinyl:index
fi

# --- seed ----------------------------------------------------------------------
say "Seeding: ${seed_args[*]}"
say "(MusicBrainz allows 1 request/second, so expect ~3 s per album. The first"
say " run also downloads the CLIP model, about 90 MB, cached afterwards.)"
npm run -s vinyl:seed -- "${seed_args[@]}"

say "Done. Start the app with 'npm run dev' and open http://localhost:3000/scan-vinyl"
if [[ "${mode:-atlas}" != "local" ]]; then
  say "Tip: a brand-new Atlas vector index takes ~1 minute to become queryable."
fi
