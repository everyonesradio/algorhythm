/** "SZA - SOS" -> "sza-sos": readable, ASCII, short. */
const slugify = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");

/** The album's shareable page: /library/sza-sos-6ae78bfcb1f8cf2dabe65e04 */
export const albumPath = (album: {
  id: string;
  artist: string;
  title: string;
}) => {
  const slug = slugify(`${album.artist} ${album.title}`);
  return `/library/${slug ? `${slug}-` : ""}${album.id}`;
};

/** The album id at the end of a page slug, or null. */
export const albumIdFromSlug = (slug: string) =>
  slug.match(/(?:^|-)([a-f\d]{24})$/i)?.[1]?.toLowerCase() ?? null;
