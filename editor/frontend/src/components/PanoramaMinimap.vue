<template>
  <div class="pt-legend" v-if="props.view === 'map'">
    <label style="--icon: '👁'">current scene</label>
    <label style="--icon: '🔗'">linked scene</label>
    <label style="--icon: '📷'">unlinked scene</label>
    <label style="--icon: '🖯'">switch scene <small>(left click)</small></label>
    <label style="--icon: '🖰'">toggle link <small>(right click)</small></label>
  </div>

  <div :class="`pt-minimap ${props.view === 'map' ? 'pt-debug' : ''}`" ref="minimapContainer"></div>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted } from 'vue';
import { divIcon, map, polyline, polygon, marker, layerGroup, Map as LeafletMap, MapOptions, Marker, Polyline } from 'leaflet';
import { useEditorState } from '../plugins/store';

const state = useEditorState();

import { Action, BuildingNodeType, BuildingWayType, EditorView } from '../util/types';

const props = defineProps<{
  view: EditorView
  scene: string,
  level: number
}>();

const emit = defineEmits<{
  action: [emit: Action]
}>();

const minimapContainer = ref<null | HTMLDivElement>(null);
const renderedPolygons = layerGroup();
const renderedMarkers = layerGroup();
const renderedLevel = layerGroup();
const markers = {} as {[key: string]: Marker};
const relations = {} as {[key: string]: Polyline};

let minimap: LeafletMap|null  = null;

watch(() => props.view, (v) => {
  setTimeout(() => {
    if (!minimap || !state.config?.map) {
      return;
    }

    minimap.invalidateSize();
    if (state.config?.map?.maxZoom) {
      minimap.setMaxZoom(state.config?.map.maxZoom + (v !== 'map' ? 0 : 1));
    }
    if (state.config?.map?.center && state.config?.map?.zoom) {
      minimap.setView(state.config?.map.center, state.config?.map.zoom + (v !== 'map' ? 0 : 1));
    }
    if (state.config?.map?.maxBounds) {
      minimap.fitBounds(state.config?.map.maxBounds);
    }
  }, 50);
}, { immediate: true });

const LINKED_ICON = divIcon({ html: '🔗️', iconSize: [20, 20], className: 'pt-minimap-active' });
const ACTIVE_ICON = divIcon({ html: '👁️', iconSize: [20, 20], className: 'pt-minimap-active' });
const INACTIVE_ICON = divIcon({ html: '📷️', iconSize: [20, 20], className: 'pt-minimap-inactive' });

onMounted(() => {
  if (!minimapContainer.value || !state.config?.map) {
    return;
  }

  minimap = map(minimapContainer.value, state.config?.map as MapOptions);
  renderedPolygons.addTo(minimap);
  renderedMarkers.addTo(minimap);
  renderedLevel.addTo(minimap);

  minimap.addEventListener('contextmenu', (evt) => {
    if (props.view === 'map' && evt.latlng && window.confirm('Do you really want to move the current scene?')) {
      emit('action', { type: 'move', action: `${evt.latlng.lat}:${evt.latlng.lng}` });
    }
  });
});

watch(() => state.config?.map.zoom, (v) => {
  if (v && minimap) {
    minimap.setZoom(v);
  }
});
watch(() => state.config?.map.minZoom, (v) => {
  if (v && minimap) {
    minimap.setMinZoom(v);
  }
});
watch(() => state.config?.map.maxZoom, (v) => {
  if (v && minimap) {
    minimap.setMaxZoom(v);
  }
});
watch(() => state.config?.map.center, (v) => {
  if (v && minimap) {
    minimap.panTo(v);
  }
});
watch(() => state.config?.map.maxBounds, (v) => {
  if (v && minimap) {
    minimap.setMaxBounds(v);
  }
});

watch(() => state.config?.map.polygons, (v) => {
  renderedPolygons.clearLayers();
  if (Array.isArray(v)) {
    for (const p of v) {
      polygon(p, { color: 'red' }).addTo(renderedPolygons);
    }
  }
}, { deep: true, immediate: true });

const computedLevels = computed(() => {
  const levels = new Map();
  if (Array.isArray(state.config?.map.elements)) {
    const nodes: {[key: string]: BuildingNodeType} = {};
    const elements: BuildingWayType[] = [];
    const building = new Set();

    for (const e of state.config?.map.elements) {
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

      const poly = polygon(e.nodes.map(id => ([nodes[id].lat, nodes[id].lon])), { color: 'white' });
        //.bindTooltip(e.tags.name, { permanent: true, direction: 'center', offset: 0.5 });

      if (/.*[^0-9\-].*/.test(e.tags['indoor:level'])) {
        building.add(poly);
      } else {
        if (!levels.has(e.tags['indoor:level'])) {
          levels.set(e.tags['indoor:level'], []);
        }
        levels.get(e.tags['indoor:level']).push(poly);
      }
    }
  }

  return levels;
});

watch(() => props.level, (level) => {
  renderedLevel.clearLayers();

  if (computedLevels.value.has(level)) {
    for (const e of computedLevels.value.get(level)) {
      e.addTo(renderedLevel);
    }
  }
}, { immediate: true });

watch(() => [state.config?.scenes, props.scene, props.level], () => {
  renderedMarkers.clearLayers();
  if (!state.config?.scenes) {
    return;
  }

  for (const [id, scene] of Object.entries(state.config?.scenes)) {
    let icon = INACTIVE_ICON;
    if (props.scene === id) {
      icon = ACTIVE_ICON;
    } else if ((scene.relations || []).includes(props.scene)) {
      icon = LINKED_ICON;
    }

    if (scene.relations) {
      for (const relation of scene.relations) {
        const link = [relation, id].sort().join(':');
        if (!state.config?.scenes[relation]) {
          continue;
        }

        const latlngs = [
          { lat: scene.lat, lng: scene.lon },
          { lat: state.config.scenes[relation].lat, lng: state.config.scenes[relation].lon }
        ];

        if (relations[link]) {
          relations[link].setLatLngs(latlngs)
        } else {
          relations[link] = polyline(latlngs);
        }

        if (scene.level === props.level) {
          relations[link].addTo(renderedMarkers);
        }
      }
    }

    if (markers[id]) {
      // just update location and icon
      markers[id].setLatLng([scene.lat, scene.lon]);
      markers[id].setIcon(icon);
    } else {
      // add marker
      markers[id] = marker([scene.lat, scene.lon], { icon })
        .on('click', () => emit('action', { type: 'scene', action: id }))
        .on('contextmenu', () => emit('action', { type: 'link', action: id }));
    }

    if (scene.level === props.level) {
      markers[id].addTo(renderedMarkers);
    }
  }

  for (const id of Object.keys(markers)) {
    if (!state.config?.scenes[id]) {
      delete markers[id];
    }
  }
}, { immediate: true, deep: true });

</script>
