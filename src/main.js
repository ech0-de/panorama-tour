export default function panoramaTour(element, config) {
    element.classList.add('pt-container');
    if (window.innerWidth > 1200) {
        config.default.hfov = 120;
    } else if (window.innerWidth > 768) {
        config.default.hfov = 100;
    } else if (window.innerWidth > 576) {
        config.default.hfov = 80;
    } else {
        config.default.hfov = 50;
    }

    Object.keys(config.scenes).forEach(s => {
        config.scenes[s].title = s;
        if (Array.isArray(config.scenes[s].relations)) {
            config.scenes[s].hotSpots = [];
            config.scenes[s].relations.forEach(l => {
                const theta = Math.atan2(
                    config.scenes[s].lat - config.scenes[l].lat,
                    config.scenes[s].lon - config.scenes[l].lon
                ) * -180 / Math.PI - config.scenes[s].northOffset - 90;

                config.scenes[s].hotSpots.push({
                    pitch: -15,
                    yaw: theta,
                    type: 'scene',
                    text: config.scenes[l].title,
                    sceneId: l,
                    sceneFadeDuration: 800
                });
            });
        }
    });

    let activeScene = null;
    const viewer = window.pannellum.viewer(element, config);
    const view = { pitch: 0, yaw: 0, hfov: 0 };
    const updateView = () => {
        view.pitch = viewer.getPitch();
        view.yaw = viewer.getYaw();
        view.hfov = viewer.getHfov();
    };
    updateView();

    viewer.on('mouseup', updateView);
    viewer.on('touchend', updateView);
    viewer.on('load', () => {
        let yawOffset = 0;
        if (activeScene !== null) {
            yawOffset = config.scenes[activeScene].northOffset;
        } else {
            yawOffset = 2 * config.scenes[viewer.getScene()].northOffset;
        }
        activeScene = viewer.getScene();
        yawOffset -= config.scenes[activeScene].northOffset;
        viewer.lookAt(view.pitch, view.yaw + yawOffset, view.hfov, false);
        updateView();
    });

    // leaflet-based minimap
    if (typeof L === 'object') {
        const minimap = document.createElement('div');
        minimap.classList.add('pt-minimap');
        element.querySelector('.pnlm-ui').append(minimap);
        const map = L.map(minimap, config.map);

        const btn = document.createElement('div');
        btn.classList.add('pt-minimap-btn');
        btn.innerHTML = '<i class="fa fa-lg fa-map"></i>';
        btn.addEventListener('click', () => {
            minimap.classList.toggle('is-visible');
            map.invalidateSize();
        });
        element.querySelector('.pnlm-ui').append(btn);

        const cameraIcon = L.divIcon({
            html: '<i class="fa fa-eye"></i>',
            iconSize: [20, 20],
            className: 'pt-minimap-inactive'
        });

        const activeIcon = L.divIcon({
            html: '<i class="fa fa-eye"></i>',
            iconSize: [20, 20],
            className: 'pt-minimap-active'
        });

        if (config.debug === true) {
            map.on('click', e => {
                const name = window.prompt('name?');
                console.log(JSON.stringify({
                    title: '',
                    description: '',
                    lat: e.latlng.lat,
                    lon: e.latlng.lng,
                    northOffset: 0,
                    panorama: name,
                    relations: []
                }, null, 2));
            });
        }

        if (Array.isArray(config.map.elements)) {
            const nodes = {};
            const elements = [];
            // const polygons = [];

            for (const e of config.map.elements) {
                if (e.type === 'node') {
                    nodes[e.id] = e;
                } else if (e.type === 'way') {
                    elements.push(e);
                }
            }


            for (const e of elements) {
                e.nodes = e.nodes.map(id => ([nodes[id].lat, nodes[id].lon]));

                if (!e.tags.hasOwnProperty('indoor') && !e.tags.hasOwnProperty('building') /* || e.tags['indoor:level'] != 0 */) {
                    continue;
                }

                // todo level navigation
                // polygons.push(e.nodes);

                L.polygon(e.nodes, { color: 'red' })
                    // .bindTooltip(e.tags.name, { permanent: true, direction: 'center' })
                    .addTo(map);
            }
            // console.log(JSON.stringify(polygons));
        }

        if (Array.isArray(config.map.polygons)) {
            for (const p of config.map.polygons) {
                L.polygon(p, { color: 'red' }).addTo(map);
            }
        }

        Object.entries(config.scenes).forEach(([id, scene]) => {
            scene.marker = L.marker([scene.lat, scene.lon], { icon: cameraIcon })
                .on('click', () => viewer.loadScene(id))
                .addTo(map);
        });

        viewer.on('load', () => {
            if (activeScene !== null) {
                config.scenes[activeScene].marker.setIcon(cameraIcon);
            }
            config.scenes[activeScene].marker.setIcon(activeIcon);
        });
    }

    const style = document.createElement('style');
    style.innerText = __minifiedCSS__;
    style.type = 'text/css';
    document.head.appendChild(style);
};
