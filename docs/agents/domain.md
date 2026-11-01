# Domain docs

**Layout:** single-context.

- Glossary: `GLOSSARY.md` at repo root (create when domain language stabilizes)
- ADRs: `docs/adr/`

### Core entities (seed)

| Term | Meaning |
|------|---------|
| **Cover / vinyl** | Physical album art the camera sees |
| **Recognition** | ML detection + album identity resolution |
| **MusicIDX** | Spotify-primary indexed release (`spotifyId` unique) |
| **Adapter** | Builds a platform URL from metadata/query |
| **Parser** | Extracts metadata from a platform URL |
| **Verified link** | Match confidence high enough to mark `isVerified` |
| **Universal link** | App-owned short/canonical result URL |

Agents: read this file + `GLOSSARY.md` before inventing domain names.
