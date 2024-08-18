<template>
  <div class="pt-editor-toolbar" v-show="model">
    <h2>{{ titleRef }}</h2>

    <button @click="submit(false)">❌ Cancel</button>
    <button @click="submit(true)">💾 Save</button>
  </div>
  <div class="pt-editor" ref="container" v-show="model"></div>
</template>

<script setup lang="ts">
import { ref, onUnmounted } from 'vue';

import * as monaco from 'monaco-editor';
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

const model = defineModel<boolean>();

self.MonacoEnvironment = {
  getWorker(_: any, label: string) {
    if (label === "json") {
      return new jsonWorker();
    }
    if (label === "css" || label === "scss" || label === "less") {
      return new cssWorker();
    }
    if (label === "html" || label === "handlebars" || label === "razor") {
      return new htmlWorker();
    }
    if (label === "typescript" || label === "javascript") {
      return new tsWorker();
    }
    return new editorWorker();
  },
};

monaco.languages.typescript.typescriptDefaults.setEagerModelSync(true);

const titleRef = ref('');
const container = ref<null | HTMLDivElement>(null);
let monacoInstance: null|monaco.editor.IStandaloneCodeEditor = null;

onUnmounted(() => {
  if (monacoInstance) {
    monacoInstance.dispose();
    monacoInstance = null;
  }
});

let currentReject: (() => any)|null;
let currentResolve: ((value: any) => void)|null;

function prompt(title: string, value: string, language: string = 'json'): Promise<string> {
  return new Promise((resolve, reject) => {
    model.value = true;
    currentReject = reject;
    currentResolve = resolve;

    titleRef.value = title;

    if (container.value) {
      monacoInstance = monaco.editor.create(container.value, {
        value: value,
        language: language,
        automaticLayout: true
      });
    }
  });
}

function submit(save: boolean) {
  if (!currentResolve || !currentReject) {
    return;
  }

  model.value = false;
  titleRef.value = '';
  const result = monacoInstance ? monacoInstance.getValue() : '';
  if (monacoInstance) {
    monacoInstance.dispose();
    monacoInstance = null;
  }

  const callback = save ? currentResolve : currentReject;
  currentReject = null;
  currentResolve = null;

  callback(result);
}

defineExpose({ prompt });
</script>

<style>
.pt-editor {
  position: absolute !important;
  top: 2em;
  left: 0px;
  right: 0px;
  width: 100vw;
  height: 100vh;
  display: block;
  background-color: rgba(0, 0, 0, 0.85);
  transition: 0.5s;
  z-index: 9999999999;
}
.pt-editor-toolbar {
  position: absolute !important;
  top: 0em;
  height: 2em;
  left: 0px;
  right: 0px;
  width: 100vw;
  display: block;
  background-color: rgba(0, 0, 0, 1);
  transition: 0.5s;
  z-index: 9999999999;
  display: flex;
  justify-content: end;
  gap: .75em;
  padding: .2em 1em;
}
.pt-editor-toolbar h2 {
  flex-grow: 1;
  font-size: 12pt;
  line-height: 2em;
}
</style>