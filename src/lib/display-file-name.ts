/**
 * A file name worth showing the applicant, or null when it is machine-made.
 * Phone cameras and some pickers name a photo with a random id
 * ("940f84e9-18c6-4894-accc-3621f5b1….jpg"), which reads as noise beside a
 * document; callers show "Uploaded" instead. Ordinary names, including the
 * camera's own "IMG_1234.jpg", are kept. Mirrors the web SDK's
 * lib/display-file-name.ts.
 */
const RANDOM_ID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;
const LONG_HEX = /^[0-9a-f]{24,}$/i;

export function displayFileName(name: string | null | undefined): string | null {
  if (!name) return null;
  const base = name.trim().replace(/\.[a-z0-9]{1,5}$/i, '');
  if (!base || RANDOM_ID.test(base) || LONG_HEX.test(base)) return null;
  return name.trim();
}
