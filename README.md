# algo<em>Rhythm</em>

This project was project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

Point your phone at a vinyl record and get the album on Spotify and other
streaming services. Recognition is **image retrieval**: covers are embedded
with CLIP and matched with MongoDB Atlas Vector Search. See
[docs/VINYL_RECOGNITION.md](docs/VINYL_RECOGNITION.md) for the architecture,
model notes and scaling plan.

## Vinyl recognition quick start

One command (checks prerequisites, pushes the schema, builds the vector
index, seeds the example list):

```bash
./scripts/seed-local.sh            # uses DATABASE_URL from .env (Atlas)
./scripts/seed-local.sh --docker   # or: local MongoDB Atlas via Docker
```

Or step by step:

```bash
cp .env.example .env            # set DATABASE_URL (Atlas) + Spotify creds
npm install
npx prisma db push
npm run vinyl:index             # create the Atlas vector index
npm run vinyl:seed -- --file seeds/albums.example.json --augment
npm run dev                     # open /scan-vinyl
```

| Script | What it does |
|---|---|
| `npm run vinyl:seed -- --artist "X" --tag "Y" --file list.json` | Seed albums and cover vectors |
| `npm run vinyl:status [-- --prune [--yes]]` | Record which albums were pressed on vinyl; prune the rest (dry run without `--yes`) |
| `npm run vinyl:remove -- --mbid <id> [--yes]` | Remove one album and its vectors |
| `npm run vinyl:links [-- --refresh]` | Resolve + store streaming links for catalog albums ahead of time |
| `npm run vinyl:index` | Create/update the Atlas vector index |
| `npm run vinyl:eval -- --dir ./photos` | Measure accuracy on real photos and calibrate thresholds |
| `npm run vinyl:synth -- --out ./eval-synthetic` | Generate phone-style test photos of seeded covers (+ negatives) |
| `npm run lint` / `npm test` | ESLint 9 (flat config) / Vitest, offline; `RUN_LIVE_TESTS=1 npm test` also hits real services |

Spotify credentials are server-only: `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET`
(the old `NEXT_PUBLIC_SPOTIFY_*` names were removed because they exposed the
secret to the browser).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `pages/index.tsx`. The page auto-updates as you edit the file.

[API routes](https://nextjs.org/docs/api-routes/introduction) can be accessed on [http://localhost:3000/api/hello](http://localhost:3000/api/hello). This endpoint can be edited in `pages/api/hello.ts`.

The `pages/api` directory is mapped to `/api/*`. Files in this directory are treated as [API routes](https://nextjs.org/docs/api-routes/introduction) instead of React pages.

This project uses [`next/font`](https://nextjs.org/docs/basic-features/font-optimization) to automatically optimize and load Inter, a custom Google Font.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js/) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/deployment) for more details.
