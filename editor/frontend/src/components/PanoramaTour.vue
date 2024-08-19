<template>
  <pre id="debug-view" v-html="debug"></pre>
  <template v-if="state?.config">
    <panorama-editor ref="editor" v-model="editorActive" />
    <panorama-viewer :scene="scene" @action="handleAction" />
    <panorama-toolbar :level="level" :view="view" :scene="scene" :editor-active="editorActive" @action="handleAction" />
    <panorama-minimap :level="level" :view="view" :scene="scene" @action="handleAction" />
    <panorama-scenes :level="level" :view="view" :scene="scene" @action="handleAction" />
  </template>
  <div id="dragindicator">
    <div id="dropzone"></div>
    <section>
      <i>📥</i>
      <span>drop panorama images here to add them to the tour!</span>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, watch, ref, onMounted, onUnmounted, toRaw } from 'vue';
import { useRouter, useRoute } from 'vue-router';

import { EditorView, Action } from '../util/types';

import PanoramaToolbar from './PanoramaToolbar.vue';
import PanoramaMinimap from './PanoramaMinimap.vue';
import PanoramaEditor from './PanoramaEditor.vue';
import PanoramaViewer from './PanoramaViewer.vue';
import PanoramaScenes from './PanoramaScenes.vue';
import { useEditorState } from '../plugins/store';

const router = useRouter();
const route = useRoute();

const state = useEditorState();

const debug = computed<string>(() => [
  ['tour', route.params.tour],
  ['level', level.value],
  ['scene', scene.value],
  ['view', view.value]
].map(e => `<b>${String(e[0]).padStart(6, ' ')}:</b> ${e[1]}`).join('\n'))

const editorActive = ref<boolean>(false);
const editor = ref<null|InstanceType<typeof PanoramaEditor>>(null);

const level = computed<number>(() => Number(route.params.level) || 0);
const scene = computed<string>(() => (Array.isArray(route.params.scene) ? route.params.scene[0] : route.params.scene) || '');
const view = computed<EditorView>(() => {
  switch (route.params.view) {
    case 'linking':
    case 'scene':
    case 'map':
      return route.params.view;

    default:
      return 'scene';
  }
});

watch(() => state.config?.default, () => {
  if (typeof(state.config?.default?.scene) !== 'undefined' && typeof(state.config?.default?.level) !== 'undefined' && route.params.scene === 'default') {
    router.push({
      name: 'editor',
      params: {
        tour: route.params.tour,
        scene: state.config?.default?.scene,
        level: state.config?.default?.level,
        view: 'scene'
      }
    });
  }
}, { immediate: true });

function dropListener(evt: DragEvent) {
  evt.preventDefault();
  dragLeaveListener();
  const files = [] as File[];

  if (evt.dataTransfer?.items) {
    [...evt.dataTransfer?.items].forEach((item) => {
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) {
          files.push(file);
        }
      }
    });
  } else {
    [...(evt.dataTransfer?.files || [])].forEach(file => files.push(file));
  }

  uploadFiles(files);
}
function dragOverListener(evt: DragEvent) {
  evt.preventDefault();
  const dropzone = document.getElementById('dropzone');
  const indicator = document.getElementById('dragindicator');
  if (indicator) {
    indicator.style.display = 'block';
  }
  if (dropzone) {
    dropzone.addEventListener('dragleave', dragLeaveListener);
  }
}

function dragLeaveListener() {
  const indicator = document.getElementById('dragindicator');
  if (indicator) {
    indicator.style.display = 'none';
  }
}
async function uploadFiles(files: File[]) {
  const tour = Array.isArray(route.params.tour) ? route.params.tour[0] : route.params.tour;
  const results = await Promise.allSettled(
    files
      .filter((file) => file.type === 'image/jpeg')
      .map((file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (evt) => {
          try {
            if (!evt.target) {
              return reject();
            }

            const res = await fetch(`/tours/${tour}`, {
              method: 'POST',
              headers: { 'content-type': file.type },
              body: evt.target.result
            });

            const data = await res.json();
            if (data?.ok && data?.scene) {
              resolve(data?.scene);
            } else {
              reject(data);
            }
          } catch (e) {
            reject(e);
          }
        };
        reader.readAsArrayBuffer(file);
      }))
  );

  const id = results.find(e => e.status === 'fulfilled');
  if (id?.value) {
    setTimeout(() => {
      router.push({ name: 'editor', params: { ...route.params, scene: String(id.value) } });
    }, 150);
  }
}

onMounted(() => {
 document.body.addEventListener('drop', dropListener);
 document.body.addEventListener('dragover', dragOverListener);
});
onUnmounted(() => {
  document.body.removeEventListener('drop', dropListener);
  document.body.removeEventListener('dragover', dragOverListener);
});

function handleAction(action: Action) {
  switch (action.type) {
    case 'view':
      if (['scene', 'map', 'linking'].includes(action.action)) {
        router.push({ name: 'editor', params: { ...route.params, view: action.action } });
      }
      break;

    case 'level':
      if (!isNaN(Number(action.action))) {
        if (action.alt) {
          state.moveSceneLevel(scene.value, Number(action.action));
        }
        if (action.action !== route.params.level) {
          router.push({ name: 'editor', params: { ...route.params, level: action.action } });
        }
      }
      break;

    case 'scene':
      switch (action.action) {
        case 'rename':
          if (!state.config?.scenes?.[scene.value]) {
            return;
          }
          const newTitle = window.prompt('Rename Scene', state.config.scenes[scene.value].title);
          if (newTitle?.length) {
            state.renameScene(scene.value, newTitle);
          }
          break;
        case 'default':
          if (!action.alt) {
            router.push({ name: 'editor', params: {
              ...route.params,
              scene: state.config?.default.scene
            }});
          } else {
            if (!state.config?.scenes?.[scene.value] || state.config?.default.scene === scene.value) {
              return;
            }
            state.makeDefault(scene.value);
          }
          break;
        case 'delete':
          if (scene.value !== state.config?.default.scene && window.confirm('Do you really want to delete this scene?')) {
            state.deleteScene(scene.value);
            router.push({ name: 'editor', params: {
              ...route.params,
              scene: state.config?.default.scene
            }});
          }
          break;
        default:
          if (state.config?.scenes?.[action.action] && scene.value !== action.action) {
            router.push({ name: 'editor', params: {
              ...route.params,
              scene: action.action,
              level: state.config?.scenes?.[action.action].level !== state.config?.scenes?.[scene.value].level
                ? state.config?.scenes?.[action.action].level
                : route.params.level
            }});
          }
      }
      break;

    case 'link':
      if (state.config?.scenes?.[action.action] && state.config?.scenes?.[scene.value]) {
        state.linkScene(scene.value, action.action);
      }
      break;

    case 'move':
      state.moveScene(scene.value, action.action, action.alt || false);
      break;

    case 'shift':
      state.shiftScene(scene.value, action.action, action.alt || false);
      break;

    case 'global':
      switch (action.action) {
        case 'add': {
          const input = document.createElement('input');
          input.multiple = true;
          input.accept = 'image/jpeg';
          input.type = 'file';
          input.onchange = () => {
            if (!input.files) {
              return;
            }

            uploadFiles(Array.from(input.files));
          };
          input.click();
          break;
        }
        case 'export':
          break;
        case 'north':
          try {
            const raw = window.prompt('Enter new Global North Offset', String(state.config?.default.north || 0));
            if (raw !== null) {
              state.setGlobalNorth(Number(raw) || 0);
            }
          } catch (e: any) {
            window.alert(`Error: ${e?.message}`);
            console.log(e);
          }
          break;
        case 'load':
          (async () => {
            let value = JSON.stringify(toRaw(state.config?.map), null, 2);
            while (editor.value && value) {
              try {
                const newValue: string = await editor.value.prompt('Edit Map JSON Configuration', value);

                try {
                  const parsed = JSON.parse(newValue);
                  state.updateMap(parsed);
                  break;
                } catch (e: any) {
                  window.alert(`Error: ${e?.message}`);
                  value = newValue;
                }
              } catch {
                // cancel edit
              }
            }
          })();
          break;
      }
      break;

    default:
      console.log('unknown action', action);
      // do nothing
  }
}
</script>

<style>
  #debug-view {
    text-align: left;
    position: fixed;
    top: 0;
    left: 0;
    background-color: rgba(0,0,0,0.8);
    color:white;
    z-index:99999;
    padding: .25em .5em;
  }

  #dragindicator {
    position: fixed;
    background-color: rgba(200, 255, 255, 0.5);
    z-index: 99999;
    inset: 0;
    display: none;
  }
  #dropzone {
    position: fixed;
    background-color: rgba(0, 0, 0, 0.1);
    z-index: 999999;
    inset: 0;
  }
  #dragindicator > section {
    position: fixed;
    top: 50%;
    left: 50%;

    background-color: black;
    border: 2px solid white;
    border-radius: .5em;
    padding: .5em 1em;
    font-size: large;

    display: flex;
    align-items: baseline;
    gap: .5em;
    transform: translate(-50%, -50%);
  }
  #dragindicator span {
    display: block;
    font-weight: bold;
  }
  #dragindicator i {
    display: block;
    font-family: emoji;
    font-size: larger;
    transform: translateY(-.1em);
  }
</style>