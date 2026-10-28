<template>
  <div id="debug-view">
    <div>
      {{ currentlyConnected }} client{{ currentlyConnected !== 1 ? 's' : '' }} connected to {{ route.params.tour }}
    </div>
    <div>
      <span :class="connectedToScene > 1 ? 'warning' : ''">
        {{ connectedToScene }} client{{ connectedToScene !== 1 ? 's' : '' }} connected to the current scene
      </span>
    </div>
    <div>&emsp;&emsp;northOffset:&nbsp; {{ state.config?.scenes[scene]?.northOffset  }}</div>
    <div>&emsp;&emsp;horizonRoll:&nbsp; {{ state.config?.scenes[scene]?.horizonRoll  }}</div>
    <div>&emsp;&emsp;horizonPitch: {{ state.config?.scenes[scene]?.horizonPitch  }}</div>
  </div>
  <template v-if="state?.config">
    <panorama-editor ref="editor" v-model="editorActive" />
    <panorama-viewer ref="viewer" :scene="scene" @action="handleAction" />
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
  <div id="loading">
    <progress />
  </div>
  <div id="upload" v-if="uploads.length">
    <section role="dialog" aria-labelledby="upload-title">
      <header>
        <span id="upload-title">{{ uploadSummary }}</span>
        <button v-if="!uploading" @click="uploads = []" title="Close">✖</button>
      </header>
      <progress :value="uploadedBytes" :max="totalBytes || 1" />
      <ul>
        <li v-for="(upload, i) in uploads" :key="i" :class="upload.status">
          <span class="name" :title="upload.name">{{ upload.name }}</span>
          <progress v-if="upload.status === 'uploading'" :value="upload.loaded" :max="upload.total || 1" />
          <span class="status" :title="uploadStatus(upload)">{{ uploadStatus(upload) }}</span>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, watch, ref, onMounted, onUnmounted, toRaw } from 'vue';
import { useRouter, useRoute } from 'vue-router';

import { EditorView, Action, Config } from '../util/types';

import PanoramaToolbar from './PanoramaToolbar.vue';
import PanoramaMinimap from './PanoramaMinimap.vue';
import PanoramaEditor from './PanoramaEditor.vue';
import PanoramaViewer from './PanoramaViewer.vue';
import PanoramaScenes from './PanoramaScenes.vue';
import { useEditorState } from '../plugins/store';
import doExport from '../util/export';

const router = useRouter();
const route = useRoute();

const state = useEditorState();

const editorActive = ref<boolean>(false);
const editor = ref<null|InstanceType<typeof PanoramaEditor>>(null);
const viewer = ref<null|InstanceType<typeof PanoramaViewer>>(null);

const connectedToScene = computed(() => Object.values(state.presence).filter(e => e === scene.value).length);
const currentlyConnected = computed(() => Object.values(state.presence).length);

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
  if (uploading.value) {
    return;
  }

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
  if (uploading.value) {
    return;
  }

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
type UploadStatus = 'queued' | 'uploading' | 'processing' | 'done' | 'duplicate' | 'failed' | 'skipped';
type Upload = {
  file: File,
  name: string,
  loaded: number,
  total: number,
  status: UploadStatus,
  scene?: string,
  error?: string
};

// upload a few files at a time, so progress is meaningful and large imports don't saturate the connection
const UPLOAD_CONCURRENCY = 3;

const uploads = ref<Upload[]>([]);
const uploading = computed(() => uploads.value.some(u => ['queued', 'uploading', 'processing'].includes(u.status)));
const totalBytes = computed(() => uploads.value.filter(u => u.status !== 'skipped').reduce((sum, u) => sum + u.total, 0));
const uploadedBytes = computed(() => uploads.value.filter(u => u.status !== 'skipped').reduce((sum, u) => sum + u.loaded, 0));
const uploadSummary = computed(() => {
  const images = uploads.value.filter(u => u.status !== 'skipped');
  const finished = images.filter(u => ['done', 'duplicate', 'failed'].includes(u.status)).length;
  const failed = images.filter(u => u.status === 'failed').length;
  const plural = images.length !== 1 ? 's' : '';

  if (uploading.value) {
    return `Uploading images… ${finished} of ${images.length} done`;
  }
  return `Uploaded ${finished - failed} of ${images.length} image${plural}${failed ? `, ${failed} failed` : ''}`;
});

function uploadStatus(upload: Upload): string {
  switch (upload.status) {
    case 'queued': return 'waiting';
    case 'uploading': return `${Math.floor(upload.loaded / (upload.total || 1) * 100)} %`;
    case 'processing': return 'processing…';
    case 'done': return '✔';
    case 'duplicate': return 'already in tour';
    case 'skipped': return 'not a JPEG, skipped';
    case 'failed': return upload.error || 'failed';
  }
}

function uploadFile(tour: string, uploadLevel: number, upload: Upload): Promise<string> {
  return new Promise((resolve, reject) => {
    // XMLHttpRequest instead of fetch(), as only it reports upload progress
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/tours/${tour}?name=${encodeURIComponent(upload.name)}&level=${uploadLevel}`);
    xhr.setRequestHeader('content-type', upload.file.type);
    xhr.responseType = 'json';

    xhr.upload.addEventListener('progress', (evt) => {
      upload.loaded = evt.loaded;
      if (evt.lengthComputable) {
        upload.total = evt.total;
      }
    });
    xhr.upload.addEventListener('load', () => {
      upload.loaded = upload.total;
      upload.status = 'processing';
    });
    xhr.addEventListener('load', () => {
      const data = xhr.response;
      if (data?.ok && data?.scene) {
        // the server answers 200 instead of 201 if the image is already part of the tour
        upload.status = xhr.status === 200 ? 'duplicate' : 'done';
        resolve(data.scene);
      } else if (xhr.status === 413) {
        reject(new Error('file too large'));
      } else {
        reject(new Error(data?.reason || `server error ${xhr.status}`));
      }
    });
    xhr.addEventListener('error', () => reject(new Error('network error')));
    xhr.send(upload.file);
  });
}

async function uploadFiles(files: File[]) {
  if (uploading.value || files.length === 0) {
    return;
  }

  const tour = Array.isArray(route.params.tour) ? route.params.tour[0] : route.params.tour;
  const uploadLevel = level.value;

  uploads.value = files.map((file) => ({
    file: file,
    name: file.name,
    loaded: 0,
    total: file.size,
    status: file.type === 'image/jpeg' ? 'queued' : 'skipped'
  }));

  // work on the reactive entries, so progress updates show up in the dialog
  const queue = uploads.value.filter(u => u.status === 'queued');
  await Promise.all(Array(UPLOAD_CONCURRENCY).fill(null).map(async () => {
    for (let upload = queue.shift(); upload; upload = queue.shift()) {
      upload.status = 'uploading';
      try {
        upload.scene = await uploadFile(tour, uploadLevel, upload);
      } catch (e) {
        upload.status = 'failed';
        upload.error = e instanceof Error ? e.message : String(e);
      }
    }
  }));

  // keep the dialog open if something needs the user's attention
  if (uploads.value.every(u => u.status === 'done' || u.status === 'duplicate')) {
    setTimeout(() => {
      if (!uploading.value) {
        uploads.value = [];
      }
    }, 1500);
  }

  const id = uploads.value.find(u => u.scene)?.scene;
  if (id) {
    setTimeout(() => {
      router.push({ name: 'editor', params: { ...route.params, scene: id } });
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
        case 'hide':
          state.toggleSceneHidden(scene.value);
          break;
        case 'intermediate':
          state.toggleSceneIntermediate(scene.value);
          break;
        case 'default':
          if (!action.alt) {
            router.push({ name: 'editor', params: {
              ...route.params,
              scene: state.config?.default.scene
            }});
          } else {
            if (!state.config?.scenes?.[scene.value] || !viewer.value) {
              return;
            }
            const view = viewer.value.getView();
            state.makeDefault(scene.value, view.pitch, view.yaw, view.hfov);
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
      if (state.config?.scenes?.[action.action] && state.config?.scenes?.[scene.value] && action.action !== scene.value) {
        state.linkScene(scene.value, action.action);
      }
      break;

    case 'move':
      state.moveScene(scene.value, action.action, action.alt || false);
      break;

    case 'tilt':
      state.tiltScene(scene.value, action.action, action.alt || false);
      break;

    case 'pitch':
      state.pitchScene(scene.value, action.action, action.alt || false);
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
          (async () => {
            if (state.config) {
              const title = window.prompt('Provide Title for Exported Tour');
              const loading = document.getElementById('loading');
              if (title && loading) {
                loading.style.display = 'block';
                await doExport(title, toRaw(state.config) as Config, action.alt || false);
                loading.style.display = 'none';
              }
            }
          })();
          break;
        case 'north':
          try {
            const raw = window.prompt('Enter new Global North Offset', String(state.config?.default.north || 0));
            if (raw !== null) {
              state.setGlobalNorth(Number(raw) || 0);
            }
          } catch (e: any) {
            window.alert(`Error: ${e?.message}`);
            console.error(e);
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
                break;
              }
            }
          })();
          break;
      }
      break;

    default:
      // do nothing
      console.warn('unknown action', action);
  }
}
</script>

<style>
  #debug-view {
    text-align: left;
    position: fixed;
    top: 2em;
    left: 0;
    background-color: rgba(0,0,0,0.8);
    color:white;
    z-index:99999;
    padding: .25em .5em;
    font-family: monospace;
  }

  #dragindicator, #loading {
    position: fixed;
    background-color: rgba(200, 255, 255, 0.5);
    z-index: 99999;
    inset: 0;
    display: none;
  }
  #loading progress {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 10em;
    height: 4em;
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
  #upload {
    position: fixed;
    background-color: rgba(0, 0, 0, 0.5);
    z-index: 99999;
    inset: 0;
  }
  #upload > section {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    box-sizing: border-box;
    width: min(32em, calc(100vw - 2em));
    max-height: calc(100vh - 2em);
    display: flex;
    flex-direction: column;
    gap: .5em;

    background-color: black;
    border: 2px solid white;
    border-radius: .5em;
    padding: .75em 1em;
  }
  #upload header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1em;
    font-weight: bold;
  }
  #upload header button {
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    font-size: large;
  }
  #upload section > progress {
    width: 100%;
  }
  #upload ul {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    font-size: small;
  }
  #upload li {
    display: grid;
    grid-template-columns: minmax(8em, 1fr) 6em minmax(0, auto);
    align-items: center;
    gap: .5em;
    padding: .15em 0;
  }
  #upload li .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  #upload li progress {
    width: 100%;
  }
  #upload li .status {
    grid-column: 3;
    text-align: right;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  #upload li.queued, #upload li.skipped {
    opacity: .6;
  }
  #upload li.done .status {
    color: #8bc34a;
  }
  #upload li.failed .status {
    color: #ff5252;
  }
  #debug-view .warning::before {
    content: "⚠️";
    padding-right: .25em;
  }
  #debug-view .warning {
    border-radius: .25em;
    padding: .25em .8em .5em .5em;
    background-color: rgba(255, 152, 0, 0.3);
  }
</style>