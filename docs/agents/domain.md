# Domain docs

**Layout:** single-context.

- Glossary: `GLOSSARY.md` at repo root (create when domain language stabilizes)
- ADRs: `docs/adr/`

### Core entities (seed)

| Term | Meaning |
|------|---------|
| **Cover / vinyl** | Physical album art the camera sees |
| **Recognition** | Cover image → nearest catalog cover by vector search → album |
| **Album** | A record (MusicBrainz release group): metadata, Spotify id/url, cached `platformLinks` |
| **Cover embedding** | A vector of one view of an album's cover (catalog, Spotify, augment, user scan) |
| **Scan** | One identify attempt; confirmed scans add a `user_scan` embedding |
| **Links** | The same release on other platforms (`links.search` for any URL, `vinyl.links` cached per album) |
| **Adapter** | Builds a platform URL from metadata/query |
| **Parser** | Extracts metadata from a platform URL |
| **Verified link** | Match confidence high enough to mark `isVerified` |
| **Universal link** | App-owned short/canonical result URL |

Agents: read this file + `GLOSSARY.md` before inventing domain names.
