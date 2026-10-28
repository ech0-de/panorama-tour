import fs from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

// Generates a pannellum multires tile set (see pannellum/utils/multires/generate.py) from an
// equirectangular panorama: the panorama is projected onto six cube faces, which are stored
// in several levels of detail, each split into tiles. pannellum then loads only the tiles
// needed for the current view and switches levels automatically when zooming.

const TILE_SIZE = 512;
const FALLBACK_SIZE = 1024;
export const TILE_FORMATS = ['webp', 'jpg'];

// face corners (top left, top right, bottom left) as used by pannellum's createCube(),
// in its coordinate system: x points right, y up and -z forward
const FACES = {
  f: [[-1, 1, -1], [1, 1, -1], [-1, -1, -1]],
  b: [[1, 1, 1], [-1, 1, 1], [1, -1, 1]],
  u: [[-1, 1, 1], [1, 1, 1], [-1, 1, -1]],
  d: [[-1, -1, -1], [1, -1, -1], [-1, -1, 1]],
  l: [[-1, 1, 1], [-1, 1, -1], [-1, -1, 1]],
  r: [[1, 1, -1], [1, 1, 1], [1, -1, -1]]
};

const rawInfo = ({ width, height, channels }) => ({ width, height, channels });

function encode(image, format) {
  return format === 'webp'
    ? image.webp({ quality: 75, effort: 4 })
    : image.jpeg({ quality: 80, mozjpeg: true });
}

// renders one cube face from the equirectangular pixels using bilinear sampling
function renderFace(pano, width, height, corners, size) {
  const [topLeft, topRight, bottomLeft] = corners;
  const face = Buffer.alloc(size * size * 3);

  for (let row = 0; row < size; row++) {
    const t = (row + 0.5) / size;
    for (let col = 0; col < size; col++) {
      const s = (col + 0.5) / size;
      const x = topLeft[0] + (topRight[0] - topLeft[0]) * s + (bottomLeft[0] - topLeft[0]) * t;
      const y = topLeft[1] + (topRight[1] - topLeft[1]) * s + (bottomLeft[1] - topLeft[1]) * t;
      const z = topLeft[2] + (topRight[2] - topLeft[2]) * s + (bottomLeft[2] - topLeft[2]) * t;

      const yaw = Math.atan2(x, -z);
      const pitch = Math.atan2(y, Math.hypot(x, z));
      const u = (yaw / (2 * Math.PI) + 0.5) * width - 0.5;
      const v = (0.5 - pitch / Math.PI) * height - 0.5;

      const u0 = Math.floor(u);
      const v0 = Math.floor(v);
      const fu = u - u0;
      const fv = v - v0;
      // wrap around horizontally, clamp at the poles
      const x0 = ((u0 % width) + width) % width;
      const x1 = (x0 + 1) % width;
      const y0 = Math.min(Math.max(v0, 0), height - 1);
      const y1 = Math.min(Math.max(v0 + 1, 0), height - 1);

      const p00 = (y0 * width + x0) * 3;
      const p01 = (y0 * width + x1) * 3;
      const p10 = (y1 * width + x0) * 3;
      const p11 = (y1 * width + x1) * 3;
      const out = (row * size + col) * 3;
      for (let c = 0; c < 3; c++) {
        const top = pano[p00 + c] * (1 - fu) + pano[p01 + c] * fu;
        const bottom = pano[p10 + c] * (1 - fu) + pano[p11 + c] * fu;
        face[out + c] = top * (1 - fv) + bottom * fv + 0.5;
      }
    }
  }

  return face;
}

/**
 * Generates the tiles for an equirectangular panorama in outDir.
 * Returns pannellum's multiRes options (without basePath), or null if the image
 * is not a full 360°x180° panorama, in which case it stays a plain equirectangular scene.
 */
export async function generateTiles(input, outDir) {
  const { data, info } = await sharp(input, { limitInputPixels: false })
    .removeAlpha()
    .toColorspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (Math.abs(info.width / info.height - 2) > 0.01) {
    return null;
  }

  const cubeSize = 8 * Math.floor(info.width / Math.PI / 8);
  const tileSize = Math.min(TILE_SIZE, cubeSize);
  const maxLevel = Math.ceil(Math.log2(cubeSize / tileSize)) + 1;

  // write into a temporary directory first, so a failed run never leaves a half-finished tile set
  const tmpDir = `${outDir}.tmp-${process.pid}`;
  await fs.rm(tmpDir, { recursive: true, force: true });
  await fs.mkdir(path.join(tmpDir, 'fallback'), { recursive: true });

  try {
    for (const [side, corners] of Object.entries(FACES)) {
      const face = sharp(renderFace(data, info.width, info.height, corners, cubeSize), {
        raw: { width: cubeSize, height: cubeSize, channels: 3 }
      });

      // halve the size per level, like generate.py
      let size = cubeSize;
      for (let level = maxLevel; level > 0; level--) {
        await fs.mkdir(path.join(tmpDir, String(level)), { recursive: true });
        const scaled = await face.clone().resize(size, size, { kernel: 'lanczos3' }).toBuffer({ resolveWithObject: true });
        const tiles = Math.ceil(size / tileSize);

        const jobs = [];
        for (let y = 0; y < tiles; y++) {
          for (let x = 0; x < tiles; x++) {
            const region = {
              left: x * tileSize,
              top: y * tileSize,
              width: Math.min(tileSize, size - x * tileSize),
              height: Math.min(tileSize, size - y * tileSize)
            };
            for (const format of TILE_FORMATS) {
              const tile = sharp(scaled.data, { raw: rawInfo(scaled.info) }).extract(region);
              jobs.push(encode(tile, format).toFile(path.join(tmpDir, String(level), `${side}${y}_${x}.${format}`)));
            }
          }
        }
        await Promise.all(jobs);
        size = Math.floor(size / 2);
      }

      const fallbackSize = Math.min(FALLBACK_SIZE, cubeSize);
      const fallback = await face.clone().resize(fallbackSize, fallbackSize, { kernel: 'lanczos3' }).toBuffer({ resolveWithObject: true });
      await Promise.all(TILE_FORMATS.map(format => encode(sharp(fallback.data, { raw: rawInfo(fallback.info) }), format)
        .toFile(path.join(tmpDir, 'fallback', `${side}.${format}`))));
    }

    await fs.rm(outDir, { recursive: true, force: true });
    await fs.rename(tmpDir, outDir);
  } catch (err) {
    await fs.rm(tmpDir, { recursive: true, force: true });
    throw err;
  }

  return {
    path: '/%l/%s%y_%x',
    fallbackPath: '/fallback/%s',
    extension: 'jpg',
    formats: TILE_FORMATS,
    tileResolution: tileSize,
    maxLevel: maxLevel,
    cubeResolution: cubeSize
  };
}

/** Lists all tile files of a tile set, relative to its base directory. */
export function listTiles(multiRes, format) {
  const files = [];
  let size = multiRes.cubeResolution;
  for (let level = multiRes.maxLevel; level > 0; level--) {
    const tiles = Math.ceil(size / multiRes.tileResolution);
    for (const side of Object.keys(FACES)) {
      for (let y = 0; y < tiles; y++) {
        for (let x = 0; x < tiles; x++) {
          files.push(`${level}/${side}${y}_${x}.${format}`);
        }
      }
    }
    size = Math.floor(size / 2);
  }
  for (const side of Object.keys(FACES)) {
    files.push(`fallback/${side}.${format}`);
  }
  return files;
}
