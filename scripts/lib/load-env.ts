/**
 * Import this FIRST in every script. ES module imports are evaluated in
 * order, so this populates process.env from .env before any other module
 * reads it (Spotify credentials, MusicBrainz User-Agent, search mode...).
 */
try {
  process.loadEnvFile?.();
} catch {
  // No .env file: rely on the real environment.
}
