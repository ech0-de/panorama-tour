<template>
  <div class="pt-container" ref="container">
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch, toRaw } from 'vue';
import hash from 'object-hash';
import 'pannellum';

const r = (180/Math.PI);
const container = ref<null | HTMLDivElement>(null);

import { useEditorState } from '../plugins/store';
import { Action } from '../util/types';

const state = useEditorState();

const props = defineProps<{
  scene: string
}>();

const emit = defineEmits<{
  action: [emit: Action]
}>();

let viewer = null as (Pannellum.Viewer|null);
let view = { pitch: 0, yaw: 0, hfov: 0 };

onMounted(() => {
  if (!container.value) {
    return;
  }

  let hfov = 50;
  if (window.innerWidth > 1200) {
    hfov = 120;
  } else if (window.innerWidth > 768) {
    hfov = 100;
  } else if (window.innerWidth > 576) {
    hfov = 80;
  }

  const scenes = {} as {[key: string]: string};
  viewer = pannellum.viewer(container.value, { default: {
    sceneFadeDuration: 1000,
    showControls: false,
    keyboardZoom: false,
    disableKeyboardCtrl: true,
    autoLoad: true,
    hfov: hfov,
  }, scenes: {} } as any);

  viewer.on('load', () => {
    if (viewer) {
      const renderer: any = viewer.getRenderer();
      if (renderer && !renderer.jankyHook) {
        renderer.jankyHook = renderer.render;
        renderer.render = (pitch: number, yaw: number, hfov: number, params: any) => {
          renderer.jankyHook(pitch, yaw, hfov, params);
          view = { pitch, yaw, hfov };
        };
      }
    }
  });

  watch(() => [state.config?.scenes, state.config?.default.north] , () => {
    if (!state.config || !viewer) {
      return;
    }

    for (const [id, scene] of Object.entries(state.config.scenes)) {
      const h = hash([toRaw(scene),state.config?.default.north]);
      if (!scenes[id] || scenes[id] !== h) {
        if (scenes[id]) {
          viewer.removeScene(id);
        }

        viewer.addScene(id, {
          type: scene.type,
          title: scene.title,
          panorama: scene.panorama,
          northOffset: scene.northOffset,
          hotSpots: [
            ...[{t: 'truenorth', y: (state.config?.default.north || 0)}, {t: 'north', y: 0}, {t: 'east', y: 90}, {t:'south', y: 180}, {t: 'west', y: 270}].flatMap(({t, y}) => Array(29).fill('').map((_, i) => ({
              pitch: i * 5 - 70,
              yaw: (y + (scene.northOffset || 0) + 360) % 360,
              type: `${(i * 5 - 70) % 70 === 0 ? 'x' : 's'}${t}`,
              text: ''
            }))),
            ...[-60, 0, 60].flatMap((p) => Array(36).fill('').map((_, i) => ({
              pitch: p,
              yaw: (i * 10 + (scene.northOffset || 0) + 360) % 360,
              type: 'stick',
              text: ''
            }))),
            ...(scene.relations || []).flatMap((target) => {
              if (!state.config?.scenes[target]) {
                return [];
              }

              const lon1 = ((scene.lon % 360) * Math.PI) / 180;
              const lat1 = ((scene.lat % 360) * Math.PI) / 180;
              const lon2 = ((state.config.scenes[target].lon % 360) * Math.PI) / 180;
              const lat2 = ((state.config.scenes[target].lat % 360) * Math.PI) / 180;

              const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
              const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
              const theta = (Math.atan2(y, x) % (2 * Math.PI)) * 180 / Math.PI;
              const bearing = (theta + (state.config?.default.north || 0) + (scene.northOffset || 0) + 360) % 360;

              return [{
                pitch: -15 - 15 * Math.sign(state.config.scenes[props.scene].level - state.config.scenes[target].level),
                yaw: bearing,
                type: 'scene',
                text: state.config.scenes[target].title || '',
                sceneId: target,
                sceneFadeDuration: 800,
                clickHandlerFunc: (evt: PointerEvent) => {
                  evt.stopPropagation();
                  if (target !== props.scene) {
                    emit('action', { type: 'scene', action: target });
                  }
                }
              }];
            })
          ]
        } as any);

        scenes[id] = h;

        if (id === props.scene) {
          if (view?.pitch && view?.hfov) {
            viewer.loadScene(id, view.pitch * r, view.yaw * r, view.hfov * r);
          } else {
            viewer.loadScene(id, 0, scene.northOffset);
          }
        }
      }
    }
  }, { immediate: true, deep: true });
});

watch(() => props.scene, (scene) => {
  if (state.config?.scenes[scene] && viewer && viewer.getScene() !== scene) {
    const oldNorthOffset = state.config?.scenes[viewer.getScene()]?.northOffset || 0;
    const newNorthOffset = state.config?.scenes[scene].northOffset || 0;
    if (view) {
      viewer.loadScene(scene, view.pitch * r, view.yaw * r - (oldNorthOffset - newNorthOffset), view.hfov * r || undefined);
    } else {
      viewer.loadScene(scene, 0, newNorthOffset);
    }
  }
}, { immediate: true });

onUnmounted(() => {
  if (viewer) {
    viewer.destroy();
    viewer = null;
  }
});

</script>
