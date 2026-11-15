export type ArtistHit = {
  similarity: number;
  artist: string;
  artistMbid: string | null;
};

export type ArtistSuggestion = {
  name: string;
  mbid: string;
  similarity: number;
};

export const ARTIST_SUGGEST = {
  floor: 0.6,
  window: 40,
  max: 3,
};

export const suggestArtists = (
  hits: ArtistHit[],
  cfg = ARTIST_SUGGEST
): ArtistSuggestion[] => {
  const near = [...hits]
    .filter((h) => h.artistMbid && h.similarity >= cfg.floor)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, cfg.window);

  const seen = new Map<string, ArtistSuggestion>();
  for (const h of near) {
    if (!seen.has(h.artistMbid!)) {
      seen.set(h.artistMbid!, {
        name: h.artist,
        mbid: h.artistMbid!,
        similarity: h.similarity,
      });
    }
  }
  return [...seen.values()].slice(0, cfg.max);
};
