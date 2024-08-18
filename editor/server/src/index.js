import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';

import express from 'express';
import ExifParser from 'exif-parser';
import jsonpatch from 'fast-json-patch';
import asyncHandler from 'express-async-handler';

import { WebSocketServer } from 'ws';
import * as turf from '@turf/turf';

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
          clients: new Set(),
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

app.get('/tours/:tour([a-fA-F0-9]{40})/:file([a-fA-F0-9]{40}).jpg', asyncHandler(async (req, res) => {
  if (req.header['if-none-match'] === req.params.file) {
    res.status(304).end();
  }
  
  try {
    const file = await fs.readFile(path.join(DATA_DIR, req.params.tour, `${req.params.file}.jpg`));
    res.set('content-type', 'image/jpeg');
    res.set('etag', req.params.file);
    res.end(file);
  } catch {
    res.status(404).end();
  }
}));

app.post('/tours/:tour', express.raw({ limit: '10mb', type: 'image/jpeg' }), asyncHandler(async (req, res) => {
  if (!tours.has(req.params.tour)) {
    return res.status(404).json({ ok: false, reason: 'tour does not exist' });
  }

  const dir = crypto.createHash('sha1').update(req.params.tour).digest('hex');
  const hash = crypto.createHash('sha1').update(req.body).digest('hex');

  const tour = tours.get(req.params.tour);
  if (tour.state?.scenes?.[hash]) {
    return res.status(204).json({ ok: true, scene: hash });
  }

  const metadata = ExifParser.create(req.body).parse();
  const center = turf.getCoord(
    turf.center(
      turf.points([
        tour.state?.map?.center,
        ...tour.state?.map?.maxBounds,
        ...Object.values(tour.state?.scenes || {}).map(e => [e.lat, e.lon])
      ].filter(e => Array.isArray(e) && e.length === 2).map(e => e.reverse()))
    )
  );

  const pre = structuredClone(tour.state);

  if (!tour.state.scenes) {
    tour.state.scenes = {};
  }

  tour.state.scenes[hash] = {
    title: `${metadata.tags?.ImageDescription || ''}`.trim(),
    lat: metadata.tags?.GPSLatitude || center[1] || 0,
    lon: metadata.tags?.GPSLongitude || center[0] || 0,
    northOffset: metadata.tags?.GPSImgDirection || 0,
    panorama: `/tours/${dir}/${hash}.jpg`,
    level: Number(req.query?.level) || 0,
    relations: []
  };

  const patch = jsonpatch.compare(pre, tour.state);
  await fs.mkdir(path.join(DATA_DIR, dir), { recursive: true });
  await fs.writeFile(path.join(DATA_DIR, dir, `${hash}.jpg`), req.body);
  const update = JSON.stringify({ type: 'update', data: patch });
  await persistTour(tour);

  for (const client of tour.clients) {
    client.send(update);
  }

  return res.status(201).json({ ok: true, scene: hash });
}));

const server = app.listen(PORT, () => console.log(`Server started: http://localhost:${PORT}`));
const wss = new WebSocketServer({ server: server });

wss.on('connection', (ws, req) => {
  if (req.url.startsWith('/tours/') && req.url.length > 8) {
    const name = req.url.split('/')[2].replace(/[^a-zA-Z0-9-]/g, '');

    let tour = tours.get(name);
    if (!tour) {
      tour = {
        name: name,
        clients: new Set(),
        state: DEFAULT_CONFIG
      };

      tours.set(name, tour);
      persistTour(tour);
    }

    tour.clients.add(ws);

    ws.send(JSON.stringify({ type: 'snapshot', data: tour.state }));

    ws.on('message', (data) => {
      const msg = data.toString();
      const parsed = JSON.parse(msg);

      switch (parsed.type) {
        case 'update':
          try {
            jsonpatch.applyPatch(tour.state, parsed.data);
            // distribute to all but sender
            for (const client of tour.clients) {
              if (client !== ws) {
                client.send(msg);
              }
            }

            persistTour(tour);
          } catch (e) {
            console.log(`[${name}] error:`, e);
          }
          break;
      }
    });

    ws.on('close', () => tour.clients.delete(ws));
    console.log(`[${name}] connected (${tour.clients.size} clients)`);
  }
});

process.on('exit', () => {
  server.close();
  wss.close();
});