export default async function panoramaTour(element, config) {
    element.classList.add('pt-container');
    if (!localStorage.getItem('scene') || !config.scenes[localStorage.getItem('scene')]) {
        localStorage.setItem('scene', config.default.firstScene);
    }
    config.default.firstScene = localStorage.getItem('scene') || config.default.firstScene;
    if (window.innerWidth > 1200) {
        config.default.hfov = 120;
    } else if (window.innerWidth > 768) {
        config.default.hfov = 100;
    } else if (window.innerWidth > 576) {
        config.default.hfov = 80;
    } else {
        config.default.hfov = 50;
    }

    let activeScene = config.default.firstScene;
    let activeLevel = null;
    const viewer = window.pannellum.viewer(element, config);
    const view = { pitch: 0, yaw: 0, hfov: 0 };
    const updateView = () => {
        view.pitch = viewer.getPitch();
        view.yaw = viewer.getYaw();
        view.hfov = viewer.getHfov();
    };
    updateView();
    const reloadView = () => {
        viewer.loadScene(activeScene);
        const b = document.querySelector('button.active');
        if (b) {
            b.click();
        }
    };

    viewer.on('mouseup', updateView);
    viewer.on('touchend', updateView);
    viewer.on('load', () => {
        let yawOffset = 0;
        if (activeScene !== null) {
            yawOffset = config.scenes[activeScene].northOffset;
        } else if (viewer.getScene()) {
            yawOffset = 2 * config.scenes[viewer.getScene()].northOffset;
        } else {
            return;
        }
        activeScene = viewer.getScene();
        yawOffset -= config.scenes[activeScene].northOffset;
        if (config.scenes[activeScene].level !== activeLevel) {
            const btn = document.querySelector(`.pt-levels button[data-level="${config.scenes[activeScene].level}"]`);
            if (btn) {
                btn.click();
            }
        }
        viewer.lookAt(view.pitch, view.yaw + yawOffset, view.hfov, false);
        localStorage.setItem('scene', activeScene);
        updateView();
    });

    // leaflet-based minimap
    if (typeof L === 'object') {
        const minimap = document.createElement('div');
        minimap.classList.add('pt-minimap');
        element.querySelector('.pnlm-ui').append(minimap);
        const map = L.map(minimap, config.map);

        const levelSelector = document.createElement('div');
        levelSelector.classList.add('pt-levels');
        element.querySelector('.pnlm-ui').append(levelSelector);

        const rendered = L.layerGroup();
        rendered.addTo(map);

        const btn = document.createElement('div');
        btn.classList.add('pt-minimap-btn');
        btn.innerHTML = '🗺️';
        btn.addEventListener('click', () => {
            levelSelector.classList.toggle('is-visible');
            minimap.classList.toggle('is-visible');
            map.invalidateSize();
        });
        element.querySelector('.pnlm-ui').append(btn);

        const cameraIcon = L.divIcon({
            html: '📷️',
            iconSize: [20, 20],
            className: 'pt-minimap-inactive'
        });

        const activeIcon = L.divIcon({
            html: '👁️',
            iconSize: [20, 20],
            className: 'pt-minimap-active'
        });

        const linkedIcon = L.divIcon({
            html: '🔗️',
            iconSize: [20, 20],
            className: 'pt-minimap-active'
        });

        if (Array.isArray(config.map.elements)) {
            const nodes = {};
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

                const polygon = L.polygon(e.nodes.map(id => ([nodes[id].lat, nodes[id].lon])), { color: 'white' });
                    //.bindTooltip(e.tags.name, { permanent: true, direction: 'center', offset: 0.5 });

                if (/.*[^0-9\-].*/.test(e.tags['indoor:level'])) {
                    building.add(polygon);
                } else {
                    if (!levels.has(e.tags['indoor:level'])) {
                        levels.set(e.tags['indoor:level'], []);
                    }
                    levels.get(e.tags['indoor:level']).push(polygon);
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
                L.polygon(p, { color: 'red' }).addTo(map);
            }
        }

        const addHotSpot = (scene, id) => {
            if (!config.scenes[id]) {
                console.error('undefined scene', id);
                return;
            }
            const theta = Math.atan2(
                scene.lat - config.scenes[id].lat,
                scene.lon - config.scenes[id].lon
            ) * -180 / Math.PI - scene.northOffset;

            scene.hotSpots.push({
                pitch: -15,
                yaw: theta,
                type: 'scene',
                text: config.scenes[id].title,
                sceneId: id,
                sceneFadeDuration: 800
            });
        }

        const addScene = (id, scene) => {
            scene.title = scene.title || id;

            if (Array.isArray(scene.relations)) {
                scene.hotSpots = [];
                scene.relations.forEach(l => addHotSpot(scene, l));
            }

            scene.marker = L.marker([scene.lat, scene.lon], { icon: cameraIcon })
                .on('click', () => viewer.loadScene(id));
        };

        Object.entries(config.scenes).forEach(([id, scene]) => addScene(id, scene));

        viewer.on('load', (e) => {
            if (!activeScene) {
                return;
            }
            Object.values(config.scenes).forEach(e => e && e.marker.setIcon(cameraIcon));
            config.scenes[activeScene].marker.setIcon(activeIcon);
        });

        setTimeout(() => {
            btn.click();

            const firstLevel = document.querySelector('.pt-levels button');
            if (firstLevel) {
                firstLevel.click();
            }
            reloadView();
        }, 100);
    }

    const style = document.createElement('style');
    style.innerText = __minifiedCSS__;
    style.type = 'text/css';
    document.head.appendChild(style);
};
