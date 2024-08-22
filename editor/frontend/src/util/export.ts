import JSZip from 'jszip';
import { saveAs } from 'file-saver';

import panoramaTourJS from 'panorama-tour/dist/panorama-tour.min.js?raw';
import panoramaTourCSS from 'panorama-tour/dist/panorama-tour.min.css?raw';

import { Config } from './types';

const sleep = (t: number) => new Promise((resolve) => setTimeout(resolve, t));

const encoder = new TextEncoder();

async function digest(raw: string) {
  const buffer = await window.crypto.subtle.digest('SHA-1', encoder.encode(raw));
  const arr = Array.from(new Uint8Array(buffer));
  const hex = arr.map((b) => b.toString(16).padStart(2, '0')).join('');
  return hex.slice(0, 8);
}

export default async function doExport(title: string, config: Config): Promise<void> {
  const zip = new JSZip();
  const clonedConfig = structuredClone(config);

  const jsHash = await digest(panoramaTourJS);
  zip.file(`assets/panorama-tour-${jsHash}.min.js`, panoramaTourJS);

  const cssHash = await digest(panoramaTourCSS);
  zip.file(`assets/panorama-tour-${cssHash}.min.css`, panoramaTourCSS);

  const hiddenScenes = new Set(
    Object.keys(clonedConfig.scenes)
      .filter(e => config.scenes[e]?.hidden === true)
  );

  for (const id of hiddenScenes) {
    delete clonedConfig.scenes[id];
  }

  for (const scene of Object.values(clonedConfig.scenes)) {
    scene.relations = scene.relations.filter(e => !hiddenScenes.has(e));
    scene.northOffset = (scene.northOffset || 0) + (config.default?.north || 0);

    const res = await fetch(scene.panorama)
    const blob = await res.arrayBuffer();

    const file = `tour/${scene.panorama.split('/').pop()}`;
    scene.panorama = file;
    zip.file(file, blob);

    await sleep(250 * Math.random());
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

  zip.file('index.html', minified);

  const blob = await zip.generateAsync({ type: 'blob' });
  saveAs(blob, `pt-${title.replace(/[^a-zA-Z0-9-_]/g, '-').replace(/--*/g, '-')}.zip`);
}