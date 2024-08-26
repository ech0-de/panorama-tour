import 'pannellum/build/pannellum.css';
import 'leaflet/dist/leaflet.css';
import './main.css';

import 'pannellum';
import 'leaflet';

export type BuildingNodeType = {
  type: 'node',
  id: string,
  lat: number,
  lon: number
};
export type BuildingWayType = {
  type: 'way',
  id: string,
  nodes: string[],
  tags: { [key: string]: any }
};

const CAMERA_ICON = L.divIcon({ html: '📷️', iconSize: [20, 20], className: 'pt-minimap-icon' });
const ACTIVE_ICON = L.divIcon({ html: '👁️', iconSize: [20, 20], className: 'pt-minimap-icon' });

export type Config = {
  scenes: {[type: string]: {
    relations: string[]
    panorama: string,
    hidden?: boolean,
    marker?: L.Marker,
    level: number,
    lat: number,
    lon: number
  } & Pannellum.GeneralOptions},
  default: {
    scene: string,
    level: number,
    north: number,
    pitch?: number,
    hfov?: number,
    yaw?: number
    view?: {
      pitch: number,
      hfov: number,
      yaw: number
    },
    autoLoad?: boolean,
    firstScene?: string,
    showZoomCtrl?: boolean,
    showFullscreenCtrl?: boolean,
  },
  map: {
    elements: (BuildingNodeType | BuildingWayType)[],
    polygons: L.LatLngExpression[][]
  } & L.MapOptions,
};

export default async function panoramaTour(element: HTMLElement, config: Config) {
  element.classList.add('pt-container');

  const storedScene = localStorage.getItem('scene');

  if (!storedScene || !config.scenes[storedScene]) {
    localStorage.setItem('scene', config.default.scene);
  }

  config.default.autoLoad = true;
  config.default.showZoomCtrl = false;
  config.default.showFullscreenCtrl = false;
  config.default.firstScene = storedScene || config.default.scene;

  if (config.default.view) {
    config.default.pitch = config.default.view.pitch;
    config.default.hfov = config.default.view.hfov;
    config.default.yaw = config.default.view.yaw;
  }

  if (window.innerWidth > 1200) {
    config.default.hfov = 120;
  } else if (window.innerWidth > 768) {
    config.default.hfov = 100;
  } else if (window.innerWidth > 576) {
    config.default.hfov = 80;
  } else {
    config.default.hfov = 50;
  }

  if (/^#[0-9a-fA-F]{40}\/[0-9]*\/[0-9]*\/[0-9]*/.test(location.hash)) {
    const [scene, pitch, yaw, hfov ] = location.hash.slice(1).split('/');
    if (config.scenes[scene]) {
      config.default.firstScene = scene;
    }
    config.default.pitch = Number(pitch) - 90;
    config.default.hfov = Number(hfov);
    config.default.yaw = Number(yaw);
  }

  let activeScene: string = '';
  let loadingScene: string = config.default.firstScene;
  let activeLevel: null|number = null;

  for (const [id, scene] of Object.entries(config.scenes)) {
    scene.title = scene.title || id;

    if (Array.isArray(scene.relations)) {
      scene.hotSpots = [];
      for (const target of scene.relations) {
        if (!config.scenes[target]) {
          console.error('undefined scene', target);
          continue;
        }

        const targetScene = config.scenes[target];

        const lon1 = ((scene.lon % 360) * Math.PI) / 180;
        const lat1 = ((scene.lat % 360) * Math.PI) / 180;
        const lon2 = ((targetScene.lon % 360) * Math.PI) / 180;
        const lat2 = ((targetScene.lat % 360) * Math.PI) / 180;

        const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
        const theta = (Math.atan2(y, x) % (2 * Math.PI)) * 180 / Math.PI;
        const bearing = (theta + (config?.default.north || 0) + (scene.northOffset || 0) + 360) % 360;

        scene.hotSpots.push({
          yaw: bearing,
          type: 'scene',
          sceneId: target,
          text: config.scenes[target].title,
          pitch: -15 - 15 * Math.sign(scene.level - config.scenes[target].level),
          clickHandlerFunc: (evt: PointerEvent) => {
            evt.stopPropagation();
            switchScene(target);
          }
        });
      }
    }

    scene.marker = L.marker([scene.lat, scene.lon], { icon: CAMERA_ICON });
    scene.marker.on('click', () => switchScene(id));

    // adjust horizonRoll and horizonPitch to rotate around north adjusted axis
    // adapted from Robert Eisele's Quaternion.js
    const [[cX, sX], [cY, sY], [cZ, sZ]] = [
      -(scene.northOffset || 0),
      (scene.horizonRoll || 0),
      (scene.horizonPitch || 0)
    ]
      .map(a => a * (Math.PI / 360))
      .map(a => [Math.cos(a), Math.sin(a)]);

    const m = [
      sX * sY * sZ + cX * cY * cZ,
      sZ * cX * cY - sX * sY * cZ,
      sX * sZ * cY + sY * cX * cZ,
      sX * cY * cZ - sY * sZ * cX
    ];

    const t = 2 * (m[2] * m[3] - m[0] * m[1]);

    if (t >= 1) {
      scene.horizonPitch = -90;
    } else if (t <= -1) {
      scene.horizonPitch = 90;
    } else {
      scene.horizonPitch = -((180/Math.PI) * Math.asin(t));
    }

    scene.horizonRoll = (180/Math.PI) * Math.atan2(2 * (m[1] * m[3] + m[0] * m[2]), 1 - 2 * (m[1] * m[1] + m[2] * m[2]));
  }

  const viewer = window.pannellum.viewer(element, config as any);
  const view = { pitch: 0, yaw: 0, hfov: 0 };
  const updateView = () => {
    view.pitch = (viewer.getPitch() + 90) % 180;
    view.hfov = (viewer.getHfov() + 360) % 360;
    view.yaw = (viewer.getYaw() + 360) % 360;

    window.location.replace(`#${activeScene}/${Math.round(view.pitch)}/${Math.round(view.yaw)}/${Math.round(view.hfov)}`);
  };

  viewer.on('animatefinished', updateView);
  viewer.on('touchend', updateView);
  viewer.on('mouseup', updateView);
  viewer.on('load', () => {
    activeScene = loadingScene;
    localStorage.setItem('scene', activeScene);

    if (config.scenes[activeScene].level !== activeLevel) {
      const btn: null|HTMLButtonElement = document.querySelector(`.pt-levels button[data-level="${config.scenes[activeScene].level}"]`);
      if (btn) {
        btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      }
    }

    Object.values(config.scenes).forEach(e => e?.marker?.setIcon?.(CAMERA_ICON));
    config.scenes[activeScene]?.marker?.setIcon?.(ACTIVE_ICON);

    updateView();
  });

  const switchScene = (target: string) => {
    if (target !== activeScene) {
      const newNorthOffset = config.scenes[target]?.northOffset || 0;
      const oldNorthOffset = config.scenes[activeScene]?.northOffset || 0;
      loadingScene = target;
      viewer.loadScene(target, view.pitch - 90, view.yaw - (oldNorthOffset - newNorthOffset), view.hfov || undefined);
    }
  };

  const pnlmUI = element.querySelector('.pnlm-ui');

  if (!pnlmUI) {
    return;
  }

  // leaflet-based minimap
  const minimap = document.createElement('div');
  minimap.classList.add('pt-minimap');
  pnlmUI.append(minimap);
  const mapObj = L.map(minimap, config.map);

  const levelSelector = document.createElement('div');
  levelSelector.classList.add('pt-levels');
  pnlmUI.append(levelSelector);

  const rendered = L.layerGroup();
  rendered.addTo(mapObj);

  const btn = document.createElement('div');
  btn.classList.add('pt-minimap-btn');
  btn.innerHTML = '🗺️';
  btn.addEventListener('click', () => {
    levelSelector.classList.toggle('is-visible');
    minimap.classList.toggle('is-visible');
    mapObj.invalidateSize();
  });
  pnlmUI.append(btn);

  if (Array.isArray(config.map.elements)) {
    const nodes: {[key: string]: BuildingNodeType} = {};
    const elements = [];
    const levels = new Map();
    const building = new Set();

    for (const e of config.map.elements) {
      if (e.type === 'node') {
        nodes[e.id] = e;
      } else if (e.type === 'way') {
        elements.push(e);
      }
    }

    for (const e of elements) {
      if (!e.tags.hasOwnProperty('indoor:level') && !e.tags.hasOwnProperty('building')) {
        continue;
      }

      const p = L.polygon(e.nodes.map(id => ([nodes[id].lat, nodes[id].lon])), { color: 'white' });

      if (/.*[^0-9\-].*/.test(e.tags['indoor:level'])) {
        building.add(p);
      } else {
        if (!levels.has(e.tags['indoor:level'])) {
          levels.set(e.tags['indoor:level'], []);
        }
        levels.get(e.tags['indoor:level']).push(p);
      }
    }

    [...levels.keys()]
      .sort((a, b) => Number(b) - Number(a))
      .forEach((level) => {
        const button = document.createElement('button');
        button.dataset.level = level;
        button.innerText = level;
        button.onclick = () => {
          const prev = document.querySelector('.pt-levels button.active');
          if (prev) {
            prev.classList.remove('active');
          }

          button.classList.add('active');
          activeLevel = level;

          rendered.clearLayers();
          [
            ...building,
            ...levels.get(level),
            ...Object.values(config.scenes).filter(e => isNaN(e.level) || e.level === level).map(e => e.marker)
          ].forEach(e => e && rendered.addLayer(e));
        }
        levelSelector.appendChild(button);
      });
  }

  if (Array.isArray(config.map.polygons)) {
    for (const p of config.map.polygons) {
      L.polygon(p, { color: 'red' }).addTo(mapObj);
    }
  }
};
