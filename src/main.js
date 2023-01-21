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

    const db = await new Promise((resolve) => {
        if (config.debug === true) {
            const req = indexedDB.open('db', 1);
            req.onupgradeneeded = (evt) => {
                evt.currentTarget.result.createObjectStore('store', {
                    keyPath: 'id',
                    autoIncrement: true
                }).createIndex('title', 'title', { unique: true });
            };
            req.onsuccess = () => {
                const db = req.result;
                const store = db.transaction('store', 'readonly').objectStore('store');
                store.openCursor().onsuccess = (evt) => {
                    const cursor = evt.target.result;
                    if (cursor) {
                        store.get(cursor.key).onsuccess = (e) => {
                            const value = e.target.result;
                            if (value) {
                                try {
                                    value.panorama = URL.createObjectURL(value.blob);
                                    config.scenes[value.file || value.title] = value;
                                } catch {
                                    console.error('could not restore scene', value.file || value.title);
                                }
                            }
                        };

                        cursor.continue();
                    } else {
                        resolve(db);
                    }
                }
            }
        } else {
            resolve(null);
        }
    });

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

    // let render = null;

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

        const maximizeMap = () => new Promise((resolve) => {
            minimap.classList.add('pt-debug');
            setTimeout(() => {
                map.invalidateSize();
                map.setMaxZoom(config.map.zoom + 1);
                map.setZoom(config.map.zoom + 1);
                resolve();
            });
        });

        const restoreMap = () => new Promise((resolve) => {
            minimap.classList.remove('pt-debug');
            setTimeout(() => {
                map.invalidateSize();
                map.setZoom(config.map.zoom);
                map.setMaxZoom(config.map.maxZoom);
                resolve();
            }, 1000);
        });

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
                .on('click', () => viewer.loadScene(id))
                .on('contextmenu', async () => {
                    if (config.debug) {
                        if (id !== activeScene) {
                            if (config.scenes[activeScene].relations.includes(id)) {
                                config.scenes[id].marker.setIcon(cameraIcon);
                                config.scenes[activeScene].relations.splice(config.scenes[activeScene].relations.indexOf(id), 1);
                                config.scenes[activeScene].hotSpots.splice(config.scenes[activeScene].hotSpots.findIndex(e => e.sceneId === id), 1);
                            } else {
                                config.scenes[id].marker.setIcon(linkedIcon);
                                config.scenes[activeScene].relations.push(id);
                                addHotSpot(config.scenes[activeScene], id);
                            }
                        } else {
                            await maximizeMap();
                            await new Promise((resolve) => map.once('click', (e) => {
                                config.scenes[id].lat = e.latlng.lat;
                                config.scenes[id].lon = e.latlng.lng;
                                config.scenes[id].level = activeLevel;
                                config.scenes[id].marker.setLatLng(e.latlng);
                                config.scenes[id].hotSpots = [];
                                config.scenes[id].relations.forEach(l => addHotSpot(scene, l));
                                restoreMap();
                                resolve();
                            }));
                        }

                        db.transaction('store', 'readwrite').objectStore('store').put({
                            ...config.scenes[activeScene],
                            hotSpots: undefined,
                            marker: undefined
                        }).onsuccess = () => reloadView();
                    }
                });
        };

        Object.entries(config.scenes).forEach(([id, scene]) => addScene(id, scene));

        viewer.on('load', (e) => {
            if (!activeScene) {
                return;
            }
            Object.values(config.scenes).forEach(e => e && e.marker.setIcon(cameraIcon));
            config.scenes[activeScene].marker.setIcon(activeIcon);

            if (config.debug === true) {
                config.scenes[activeScene].relations.forEach((l) => {
                    config.scenes[l].marker.setIcon(linkedIcon);
                });
            }
        });

        if (config.debug === true && db) {
            document.addEventListener('dragover', (e) => e.preventDefault());
            document.addEventListener('drop', async (e) => {
                e.preventDefault();

                const files = new Set([
                    ...[...e.dataTransfer.items].map(e => e.getAsFile()),
                    ...e.dataTransfer.files
                ]);

                await maximizeMap();
                const preview = document.createElement('img');
                preview.style.position = 'fixed';
                preview.style.top = 0;
                preview.style.left = '50%';
                preview.style.width = '30vw';
                preview.style.marginLeft = '-15vw';
                preview.style.zIndex = 999;
                document.body.appendChild(preview);

                for (const file of files) {
                    const url = URL.createObjectURL(file);
                    preview.src = url;

                    if (config.scenes[file.name]) {
                        continue;
                    }

                    await new Promise((resolve) => map.once('click', (e) => {
                        const obj = {
                            blob: file,
                            file: file.name,
                            title: file.name,
                            description: '',
                            level: activeLevel,
                            lat: e.latlng.lat,
                            lon: e.latlng.lng,
                            northOffset: 0,
                            panorama: url,
                            relations: []
                        }

                        db.transaction('store', 'readwrite').objectStore('store').add(obj).onsuccess = () => {
                            config.scenes[file.name] = obj;
                            addScene(file.name, obj)
                            resolve();
                        };
                    }));
                }

                preview.remove();
                await restoreMap();
            });

            const btn = document.createElement('div');
            btn.classList.add('pt-minimap-btn');
            btn.style.marginBottom = '54px';
            btn.innerHTML = '📁';
            btn.addEventListener('click', () => {
                const serialized = {
                    default: config.default,
                    map: config.map,
                    scenes: Object.fromEntries(Object.entries(config.scenes).map(([id, scene]) => [id, {
                        ...scene,
                        panorama: scene.file || scene.title,
                        hotSpots: undefined,
                        marker: undefined,
                        blob: undefined
                    }]))
                };

                console.log(serialized);
                console.log(JSON.stringify(serialized));
            });
            element.querySelector('.pnlm-ui').append(btn);

            const delBtn = document.createElement('div');
            delBtn.classList.add('pt-minimap-btn');
            delBtn.style.marginBottom = `${54 * 2}px`;
            delBtn.innerHTML = '🗑️';
            delBtn.addEventListener('click', async () => {
                for (const scene of Object.keys(config.scenes).filter(e => config.scenes[e].relations.includes(activeScene))) {
                    config.scenes[scene].relations = config.scenes[scene].relations.filter(e => e !== activeScene);
                    await new Promise(resolve => db
                        .transaction('store', 'readwrite')
                        .objectStore('store')
                        .put({
                            ...config.scenes[scene],
                            hotSpots: undefined,
                            marker: undefined
                        })
                        .addEventListener('success', resolve)
                    );
                };

                await new Promise(resolve => db
                    .transaction('store', 'readwrite')
                    .objectStore('store')
                    .delete(config.scenes[activeScene].id)
                    .addEventListener('success', resolve)
                );

                map.removeLayer(config.scenes[activeScene].marker);
                delete config.scenes[activeScene];
                reloadView();
            });
            element.querySelector('.pnlm-ui').append(delBtn);

            const renameBtn = document.createElement('div');
            renameBtn.classList.add('pt-minimap-btn');
            renameBtn.style.marginBottom = `${54 * 3}px`;
            renameBtn.innerHTML = '🏷️';
            renameBtn.addEventListener('click', async () => {
                const name = prompt(`New title for ${activeScene}?`, config.scenes[activeScene].title);
                if (name) {
                    if (!config.scenes[activeScene].file) {
                        config.scenes[activeScene].file = config.scenes[activeScene].title;
                    }
                    config.scenes[activeScene].title = name;

                    await new Promise(resolve => db
                        .transaction('store', 'readwrite')
                        .objectStore('store')
                        .put({
                            ...config.scenes[activeScene],
                            hotSpots: undefined,
                            marker: undefined
                        })
                        .addEventListener('success', resolve)
                    );
                    reloadView();
                }
            });
            element.querySelector('.pnlm-ui').append(renameBtn);
        }

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
