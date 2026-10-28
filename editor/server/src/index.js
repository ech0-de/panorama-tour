import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';

import express from 'express';
import ExifParser from 'exif-parser';
import jsonpatch from 'fast-json-patch';

import { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import * as turf from '@turf/turf';

import sharp from 'sharp';

import { generateTiles, InvalidImageError } from './tiles.js';

const PORT = process.env.PORT !== undefined ? parseInt(process.env.PORT) : 3030;
const DATA_DIR = process.env.DATA_DIR !== undefined ? process.env.DATA_DIR : 'data';
const STATIC_DIR = process.env.STATIC_DIR !== undefined ? process.env.STATIC_DIR : '../../';

const DEFAULT_CONFIG = {
  default: {
    scene: '7f56d3744f078c739a534a40eb82b07c816de333',
    level: 0,
    north: 0
  },

  map: {
    attributionControl: false,
    zoomControl: false,
    zoom: 19,
    minZoom: 19,
    maxZoom: 19,
    center: [0.0, 0.0],
    maxBounds: [[0.00045, 0.00045], [-0.00045, -0.00045]],
    maxBoundsViscosity: 1,
    elements: [],
    polygons: [[[0.0003, 0.0004], [-0.0003, 0.0004], [-0.0003, -0.0004], [0.0003, -0.0004]]]
  },

  scenes: {
    '7f56d3744f078c739a534a40eb82b07c816de333': {
      title: 'Default Scene',
      lat: 0.0,
      lon: 0.0,
      northOffset: 0,
      panorama: '/default.jpg',
      relations: [],
      level: 0
    }
  }
};

await fs.mkdir(DATA_DIR, { recursive: true });

const tours = new Map();

try {
  const files = await fs.readdir(DATA_DIR, { withFileTypes: true, encoding: 'utf-8' });
  for (const file of files) {
    if (file.isFile() && file.name.endsWith('.json')) {
      try {
        const snapshot = JSON.parse(await fs.readFile(path.join(DATA_DIR, file.name), 'utf-8'));
        const name = file.name.slice(0, -5);
        tours.set(name, {
          name: name,
          clients: new Map(),
          state: snapshot
        });
      } catch {
        // ignore
      }
    }
  }
} catch (err) {
  console.error(err);
} 

function persistTour(tour) {
  return fs.writeFile(
    path.join(DATA_DIR, `${tour.name}.json`),
    JSON.stringify(tour.state, null, 2)
  );
}

const app = express();
app.use(express.static(STATIC_DIR));

// express 5 no longer supports inline regular expressions in route parameters
app.get(/^\/tours\/([a-fA-F0-9]{40})\/([a-fA-F0-9]{40})\.jpg$/, async (req, res) => {
  const [tour, file] = [req.params[0], req.params[1]];
  if (req.get('if-none-match') === file) {
    return res.status(304).end();
  }
  
  try {
    const image = await fs.readFile(path.join(DATA_DIR, tour, `${file}.jpg`));
    res.set('content-type', 'image/jpeg');
    res.set('etag', file);
    res.end(image);
  } catch {
    res.status(404).end();
  }
});

// multires tiles: /tours/<tour dir>/<image hash>/<level or "fallback">/<face><row>_<col>.<format>
app.get(/^\/tours\/([a-f0-9]{40})\/([a-f0-9]{40})\/([0-9]+|fallback)\/([fbudlr](?:[0-9]+_[0-9]+)?\.(?:jpg|webp))$/, (req, res) => {
  res.sendFile(path.resolve(DATA_DIR, ...Object.values(req.params).slice(0, 4)), { maxAge: '7d' }, (err) => {
    if (err) {
      res.status(404).end();
    }
  });
});

// tile generation needs a lot of memory and CPU, so only process one image at a time
let tileQueue = Promise.resolve();
function queueTiles(input, outDir) {
  const job = tileQueue.then(() => generateTiles(input, outDir));
  tileQueue = job.catch(() => {});
  return job;
}

app.post('/tours/:tour', express.raw({ limit: '100mb', type: 'image/jpeg' }), async (req, res) => {
  if (!tours.has(req.params.tour)) {
    return res.status(404).json({ ok: false, reason: 'tour does not exist' });
  }

  // express.raw() only fills the body for image/jpeg requests
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(415).json({ ok: false, reason: 'expected a JPEG image' });
  }

  const dir = crypto.createHash('sha1').update(req.params.tour).digest('hex');
  const hash = crypto.createHash('sha1').update(req.body).digest('hex');

  const tour = tours.get(req.params.tour);
  if (tour.state?.scenes?.[hash]) {
    return res.status(200).json({ ok: true, scene: hash });
  }

  // check the actual file content, as the content type is only what the client claims
  const format = await sharp(req.body).metadata().then(m => m.format, () => null);
  if (format !== 'jpeg') {
    return res.status(422).json({ ok: false, reason: format ? `not a JPEG image, but ${format}` : 'not a valid image' });
  }

  // broken EXIF data doesn't make the image unusable, it just lacks the metadata
  let metadata = { tags: {} };
  try {
    metadata = ExifParser.create(req.body).parse();
  } catch (err) {
    console.warn(`[${req.params.tour}] ignoring broken EXIF data in ${hash}: ${err.message}`);
  }

  // generate the tiles first, which also fully decodes the image, so nothing is stored for broken images
  let multiRes;
  try {
    multiRes = await queueTiles(req.body, path.join(DATA_DIR, dir, hash));
  } catch (err) {
    if (err instanceof InvalidImageError) {
      return res.status(422).json({ ok: false, reason: err.message });
    }
    throw err;
  }

  await fs.mkdir(path.join(DATA_DIR, dir), { recursive: true });
  await fs.writeFile(path.join(DATA_DIR, dir, `${hash}.jpg`), req.body);

  // the same image might have been added by someone else while the tiles were generated
  if (tour.state?.scenes?.[hash]) {
    return res.status(200).json({ ok: true, scene: hash });
  }

  const center = turf.getCoord(
    turf.center(
      turf.points([
        tour.state?.map?.center,
        ...tour.state?.map?.maxBounds,
        ...Object.values(tour.state?.scenes || {}).map(e => [e.lat, e.lon])
      // turf expects [lon, lat]; swap into new arrays, as reverse() would flip the tour's own map.center and maxBounds
      ].filter(e => Array.isArray(e) && e.length === 2).map(([lat, lon]) => [lon, lat]))
    )
  );

  const pre = structuredClone(tour.state);

  if (!tour.state.scenes) {
    tour.state.scenes = {};
  }

  tour.state.scenes[hash] = {
    title: path.parse(`${req.query?.name || ''}`).name.trim() || `${metadata.tags?.ImageDescription || ''}`.trim(),
    lat: metadata.tags?.GPSLatitude || center[1] || 0,
    lon: metadata.tags?.GPSLongitude || center[0] || 0,
    northOffset: metadata.tags?.GPSImgDirection || 0,
    panorama: `/tours/${dir}/${hash}.jpg`,
    level: Number(req.query?.level) || 0,
    relations: [],
    ...(multiRes ? { multiRes: { ...multiRes, basePath: `/tours/${dir}/${hash}` } } : {})
  };

  const patch = jsonpatch.compare(pre, tour.state);
  const update = JSON.stringify({ type: 'update', data: patch });
  await persistTour(tour);

  for (const client of tour.clients.keys()) {
    client.send(update);
  }

  return res.status(201).json({ ok: true, scene: hash });
});

// serve the editor for client-side routes like /:tour/:level/:scene/:view
app.get('/{*path}', (req, res, next) => {
  if (!req.accepts('html')) {
    return next();
  }

  res.sendFile(path.resolve(STATIC_DIR, 'index.html'), (err) => err && next());
});

// reply with JSON instead of express' HTML error page, which includes stack traces
// (express only treats handlers with four parameters as error handlers, so next has to stay)
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) {
    console.error(err);
  }
  res.status(status).json({ ok: false, reason: err.expose ? err.message : 'internal server error' });
});

const server = app.listen(PORT, () => console.log(`Server started: http://localhost:${PORT}`));
const wss = new WebSocketServer({ server: server });

function broadcastPresenceUpdate(tour, { id, scene }) {
  const msg = JSON.stringify({ type: 'presence', id: id, scene: scene });
  for (const client of tour.clients.keys()) {
    client.send(msg);
  }
}

wss.on('connection', (ws, req) => {
  if (req.url.startsWith('/tours/') && req.url.length > 8) {
    const name = req.url.split('/')[2].replace(/[^a-zA-Z0-9-]/g, '');

    let tour = tours.get(name);
    if (!tour) {
      tour = {
        name: name,
        clients: new Map(),
        state: structuredClone(DEFAULT_CONFIG)
      };

      tours.set(name, tour);
      persistTour(tour);
    }

    const presence = {
      id: uuidv4(),
      scene: tour.state?.default?.scene
    };

    broadcastPresenceUpdate(tour, presence);
    tour.clients.set(ws, presence);
    ws.send(JSON.stringify({
      type: 'snapshot',
      data: tour.state,
      presence: Object.fromEntries([...tour.clients.values()].map(e => [e.id, e.scene]))
    }));

    ws.on('message', (data) => {
      const msg = data.toString();
      const parsed = JSON.parse(msg);

      switch (parsed.type) {
        case 'update':
          try {
            if (parsed.data?.presence) {
              presence.scene = parsed.data?.presence;
              broadcastPresenceUpdate(tour, presence);
            } else {
              jsonpatch.applyPatch(tour.state, parsed.data);
              // distribute to all but sender
              for (const client of tour.clients.keys()) {
                if (client !== ws) {
                  client.send(msg);
                }
              }

              persistTour(tour);
            }
          } catch (e) {
            console.log(`[${name}] error:`, e);
          }
          break;
      }
    });

    ws.on('close', () => {
      presence.scene = null;
      tour.clients.delete(ws);
      broadcastPresenceUpdate(tour, presence);
    });
    console.log(`[${name}] connected (${tour.clients.size} clients)`);
  }
});

process.on('exit', () => {
  server.close();
  wss.close();
});
