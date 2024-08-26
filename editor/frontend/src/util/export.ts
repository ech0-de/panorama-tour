import JSZip from 'jszip';
import { saveAs } from 'file-saver';

import panoramaTourJS from 'panorama-tour/dist/panorama-tour.min.js?raw';
import panoramaTourCSS from 'panorama-tour/dist/panorama-tour.min.css?raw';

import { BuildingWayType, Config } from './types';

const sleep = (t: number) => new Promise((resolve) => setTimeout(resolve, t));

const encoder = new TextEncoder();

async function digest(raw: string) {
  const buffer = await window.crypto.subtle.digest('SHA-1', encoder.encode(raw));
  const arr = Array.from(new Uint8Array(buffer));
  const hex = arr.map((b) => b.toString(16).padStart(2, '0')).join('');
  return hex.slice(0, 8);
}

export default async function doExport(title: string, config: Config, htmlOnly: boolean): Promise<void> {
  const prefix = `pt-${title}`.replace(/[^a-zA-Z0-9-_]/g, '-').replace(/--*/g, '-');

  const zip = !htmlOnly ? new JSZip() : null;
  const levelsWithScenes = new Set();
  const clonedConfig = structuredClone(config);

  levelsWithScenes.add(0);
  levelsWithScenes.add(1);

  const elements = clonedConfig.map.elements.filter(e => e.type === 'way' && levelsWithScenes.has(e.tags['indoor:level'])) as BuildingWayType[];
  const requiredNodes = new Set(elements.flatMap(e => e.nodes));

  clonedConfig.map.elements = [
    ...clonedConfig.map.elements.filter(e => e.type === 'node' && requiredNodes.has(e.id)),
    ...elements
  ];

  const jsHash = await digest(panoramaTourJS);
  const cssHash = await digest(panoramaTourCSS);

  if (zip) {
    zip.file(`${prefix}/assets/panorama-tour-${jsHash}.min.js`, panoramaTourJS);
    zip.file(`${prefix}/assets/panorama-tour-${cssHash}.min.css`, panoramaTourCSS);

    // create mock leaflet assets to prevent 404 errors
    [ 'layers', 'layers-2x', 'marker-icon', 'marker-icon-2x', 'marker-shadow' ].forEach(f => zip.file(
      `${prefix}/assets/images/${f}.png`,
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      { base64: true }
    ));
  }

  const hiddenScenes = new Set(
    Object.keys(clonedConfig.scenes)
      .filter(e => config.scenes[e]?.hidden === true)
  );

  for (const id of hiddenScenes) {
    delete clonedConfig.scenes[id];
  }

  for (const scene of Object.values(clonedConfig.scenes)) {
    scene.relations = scene.relations.filter(e => !hiddenScenes.has(e));
    levelsWithScenes.add(scene.level);

    const file = `tour/${scene.panorama.split('/').pop()}`;
    scene.panorama = file;

    if (zip) {
      const res = await fetch(scene.panorama)
      const blob = await res.arrayBuffer();
      zip.file(`${prefix}/${file}`, blob);
      await sleep(250 * Math.random());
    }
  }

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>${title}</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link rel="stylesheet" href="assets/panorama-tour-${cssHash}.min.css">
    </head>
    <body style="height:100vh">
      <script src="assets/panorama-tour-${jsHash}.min.js"></script>
      <script type="text/javascript">
        panoramaTour(document.body, ${JSON.stringify(clonedConfig)});
      </script>
    </body>
    </html>
  `;

  const minified = html
    .replace(/^\s*/gm, '')
    .replace(/\s*$/gm, '')
    .replace(/\r?\n/g, '');

  if (zip) {
    zip.file(`${prefix}/index.html`, minified);

    const blob = await zip.generateAsync({ type: 'blob' });
    saveAs(blob, `${prefix}.zip`);
  } else {
    const blob = new Blob([minified], { type: 'text/html' });
    saveAs(blob, `${prefix}-index.html`);
  }
}