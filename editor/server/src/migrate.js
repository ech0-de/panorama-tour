// Generates multires tiles for scenes of existing tours that don't have them yet.
//
//   npm run migrate -- [--tour NAME]... [--force] [--dry-run]
//
// Uses the same DATA_DIR and PORT environment variables as the server. The server keeps
// tours in memory and would overwrite the changes, so it has to be stopped while this runs.

import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { generateTiles } from './tiles.js';

const PORT = process.env.PORT !== undefined ? parseInt(process.env.PORT) : 3030;
const DATA_DIR = process.env.DATA_DIR !== undefined ? process.env.DATA_DIR : 'data';

const { values: args } = parseArgs({
  options: {
    tour: { type: 'string', multiple: true },
    force: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    'ignore-running-server': { type: 'boolean', default: false }
  }
});

function serverRunning() {
  return new Promise((resolve) => {
    const socket = net.connect(PORT, 'localhost');
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('error', () => resolve(false));
  });
}

if (!args['dry-run'] && !args['ignore-running-server'] && await serverRunning()) {
  console.error(`something is listening on port ${PORT}, stop the server first (or pass --ignore-running-server)`);
  process.exit(1);
}

const files = (await fs.readdir(DATA_DIR))
  .filter(f => f.endsWith('.json'))
  .filter(f => !args.tour || args.tour.includes(f.slice(0, -5)));

let converted = 0;
let skipped = 0;
let failed = 0;

for (const file of files) {
  const tourFile = path.join(DATA_DIR, file);
  const tour = JSON.parse(await fs.readFile(tourFile, 'utf-8'));

  for (const [id, scene] of Object.entries(tour.scenes || {})) {
    const match = /^\/tours\/([a-f0-9]{40})\/([a-f0-9]{40})\.jpg$/.exec(scene.panorama || '');
    if (!match || (scene.multiRes && !args.force)) {
      continue;
    }

    const [, dir, hash] = match;
    const label = `[${file.slice(0, -5)}] ${scene.title || id}`;
    if (args['dry-run']) {
      console.log(`${label}: would generate tiles`);
      converted++;
      continue;
    }

    try {
      const started = Date.now();
      const multiRes = await generateTiles(await fs.readFile(path.join(DATA_DIR, dir, `${hash}.jpg`)), path.join(DATA_DIR, dir, hash));
      if (!multiRes) {
        console.log(`${label}: not a full 360° panorama, keeping it as is`);
        skipped++;
        continue;
      }

      scene.multiRes = { ...multiRes, basePath: `/tours/${dir}/${hash}` };
      // save after every scene, so an interrupted run keeps its progress
      await fs.writeFile(`${tourFile}.tmp`, JSON.stringify(tour, null, 2));
      await fs.rename(`${tourFile}.tmp`, tourFile);
      console.log(`${label}: done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
      converted++;
    } catch (err) {
      console.error(`${label}: failed: ${err.message}`);
      failed++;
    }
  }
}

console.log(`${args['dry-run'] ? 'would convert' : 'converted'} ${converted} scenes, skipped ${skipped}, failed ${failed}`);
process.exit(failed ? 1 : 0);
