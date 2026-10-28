import { MultiResConfig } from './types';

// smallest lossy WebP image, used to find out whether the browser can decode WebP
const WEBP_PROBE = 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA';

export const webpSupported: Promise<boolean> = new Promise((resolve) => {
  const img = new Image();
  img.onload = () => resolve(img.width === 1);
  img.onerror = () => resolve(false);
  img.src = WEBP_PROBE;
});

/** pannellum options for a multires scene, using the most efficient tile format the browser supports */
export function multiResOptions(multiRes: MultiResConfig, webp: boolean): NonNullable<Pannellum.MultiresOptions['multiRes']> {
  const formats = multiRes.formats || [multiRes.extension];
  const extension = webp && formats.includes('webp') ? 'webp' : (formats.find(f => f !== 'webp') || multiRes.extension);
  const { formats: _, ...options } = multiRes;
  return { ...options, extension };
}

/** Lists all tile files of a tile set relative to its basePath, mirroring the server's tile generation. */
export function listTiles(multiRes: MultiResConfig, format: string): string[] {
  const sides = ['f', 'b', 'u', 'd', 'l', 'r'];
  const files = [] as string[];
  let size = multiRes.cubeResolution;
  for (let level = multiRes.maxLevel; level > 0; level--) {
    const tiles = Math.ceil(size / multiRes.tileResolution);
    for (const side of sides) {
      for (let y = 0; y < tiles; y++) {
        for (let x = 0; x < tiles; x++) {
          files.push(`${level}/${side}${y}_${x}.${format}`);
        }
      }
    }
    size = Math.floor(size / 2);
  }
  for (const side of sides) {
    files.push(`fallback/${side}.${format}`);
  }
  return files;
}
