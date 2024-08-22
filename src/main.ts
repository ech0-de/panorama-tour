import 'pannellum/build/pannellum.css';
import 'leaflet/dist/leaflet.css';
import './main.css';

import 'pannellum';
import 'leaflet';

export type SceneConfig = Pannellum.GeneralOptions & {
  relations: string[]
  panorama: string,
  hidden?: boolean,
  marker?: L.Marker,
  level: number,
  lat: number,
  lon: number
};

export type DefaultConfig = {
  scene: string,
  level: number,
  north: number,
  hfov?: number,
  firstScene?: string,
};

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

export type MapConfig = L.MapOptions & {
  elements: (BuildingNodeType|BuildingWayType)[],
  polygons: L.LatLngExpression[][]
};

export type Config = {
  scenes: {[type: string]: SceneConfig},
  default: DefaultConfig,
  map: MapConfig,
};

export default async function panoramaTour(element: HTMLElement, config: Config) {
  element.classList.add('pt-container');

  const storedScene = localStorage.getItem('scene');
  const firstScene = config.default.firstScene || config.default.scene;

  if (!storedScene || !config.scenes[storedScene]) {
    localStorage.setItem('scene', firstScene);
  }
  config.default.firstScene = storedScene || firstScene;

  if (window.innerWidth > 1200) {
    config.default.hfov = 120;
  } else if (window.innerWidth > 768) {
    config.default.hfov = 100;
  } else if (window.innerWidth > 576) {
    config.default.hfov = 80;
  } else {
    config.default.hfov = 50;
  }

  let activeLevel: null|number = null;
  let activeScene: string = config.default.firstScene;
  const viewer = window.pannellum.viewer(element, config.scenes[activeScene]);
  const view = { pitch: 0, yaw: 0, hfov: 0 };
  const updateView = () => {
    view.pitch = viewer.getPitch();
    view.yaw = viewer.getYaw();
    view.hfov = viewer.getHfov();
  };
  updateView();
  const reloadView = () => {
    viewer.loadScene(activeScene);
    const b: null|HTMLButtonElement = document.querySelector('button.active');
    if (b) {
      b.click();
    }
  };

  viewer.on('mouseup', updateView);
  viewer.on('touchend', updateView);
  viewer.on('load', () => {
    let yawOffset = 0;
    if (activeScene !== null) {
      yawOffset = config.scenes[activeScene].northOffset || 0;
    } else if (viewer.getScene()) {
      yawOffset = 2 * (config.scenes[viewer.getScene()]?.northOffset || 0);
    } else {
      return;
    }

    activeScene = viewer.getScene();
    yawOffset -= config.scenes[activeScene].northOffset || 0;
    if (config.scenes[activeScene].level !== activeLevel) {
      const btn: null|HTMLButtonElement = document.querySelector(`.pt-levels button[data-level="${config.scenes[activeScene].level}"]`);
      if (btn) {
        btn.click();
      }
    }
    viewer.lookAt(view.pitch, view.yaw + yawOffset, view.hfov, false);
    localStorage.setItem('scene', activeScene);
    updateView();
  });

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

  const cameraIcon = L.divIcon({ html: '📷️', iconSize: [20, 20], className: 'pt-minimap-icon' });
  const activeIcon = L.divIcon({ html: '👁️', iconSize: [20, 20], className: 'pt-minimap-icon' });

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

      const p = L.polygon(e.nodes.map(id => ([nodes[id].lat, nodes[id].lon])), { color: 'white' })
        .bindTooltip(e.tags.name, { permanent: true, direction: 'center', offset: [0.5, 0] });

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
            ...Object.values(config.scenes).filter(e => !e.level || e.level === level).map(e => e.marker)
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

  for (const [id, scene] of Object.entries(config.scenes)) {
    scene.title = scene.title || id;

    if (Array.isArray(scene.relations)) {
      scene.hotSpots = [];
      for (const target of scene.relations) {
        if (!config.scenes[target]) {
          console.error('undefined scene', target);
          break;
        }
        const theta = Math.atan2(
          scene.lat - config.scenes[target].lat,
          scene.lon - config.scenes[target].lon
        ) * -180 / Math.PI - (scene.northOffset || 0);

        scene.hotSpots.push({
          pitch: -15,
          yaw: theta,
          type: 'scene',
          text: config.scenes[target].title,
          sceneId: id
        });
      }
    }

    scene.marker = L.marker([scene.lat, scene.lon], { icon: cameraIcon })
      .on('click', () => viewer.loadScene(id));
  }

  viewer.on('load', () => {
    if (!activeScene) {
      return;
    }

    Object.values(config.scenes).forEach(e => e?.marker?.setIcon?.(cameraIcon));
    config.scenes[activeScene]?.marker?.setIcon?.(activeIcon);
  });

  setTimeout(() => {
    btn.click();

    const firstLevel: null|HTMLButtonElement = document.querySelector('.pt-levels button');
    if (firstLevel) {
      firstLevel.click();
    }
    reloadView();
  }, 100);
};
