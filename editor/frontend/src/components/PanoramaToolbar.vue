<template>
  <div id="toolbar">
    <fieldset v-for="(group, label) in actions" :key="label">
      <label>{{ label }}</label>
      <button v-for="(a, i) in group" :key="i" :aria-keyshortcuts="a.hotkey" @contextmenu.prevent="onClick(a, true)" @click="onClick(a, false)" :class="a.class" :title="a.label" :style="a.style">{{ a.icon }}</button>
    </fieldset>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, computed } from 'vue';

import { useEditorState } from '../plugins/store';
import { Action, EditorView, NUMBER_EMOJI } from '../util/types';

const state = useEditorState();

const props = defineProps<{
  scene: string,
  level: number,
  view: EditorView,
  editorActive: boolean
}>();

const emit = defineEmits<{
  action: [emit: Action ]
}>();

type ToolbarAction = {
  hotkey: string,
  icon: string,
  label: string,
  emit: Action,
  class?: string,
  style?: string
}

const actions = computed<{[key: string]: ToolbarAction[]}>(() => {
  const levels = new Set();

  if (!state.config) {
    return {} as {[key: string]: ToolbarAction[]};
  }

  for (const e of Object.values(state.config.map?.elements || {})) {
      if (e.type === 'way' && typeof(e.tags?.['indoor:level']) !== 'undefined') {
        levels.add(e.tags['indoor:level']);
      }
  }
  
  return {
    'View': [{
      hotkey: 'b',
      icon: '🌐',
      label: 'Scene View',
      class: props.view === 'scene' ? 'active' : '',
      emit: { type: 'view', action: 'scene' }
    }, {
      hotkey: 'n',
      icon: '🔗',
      label: 'Linking View',
      class: props.view === 'linking' ? 'active' : '',
      emit: { type: 'view', action: 'linking' }
    }, {
      hotkey: 'm',
      icon: '🗺️',
      label: 'Map View',
      class: props.view === 'map' ? 'active' : '',
      emit: { type: 'view', action: 'map' }
    }],
    'Building Levels': [...levels].sort().map((level, i, all) => ({
      class: `${props.level === Number(level) ? 'active' : ''} ${Number(level) < 0 ? 'negative' : ''}`,
      style: `filter: hue-rotate(${150 - Math.round(i * (360/all.length))}deg);`,
      icon: NUMBER_EMOJI[Math.abs(Number(level))],
      label: `Level ${level} (⎇ Alt + ${i + 1} to move current scene to this level)`,
      hotkey: String(i + 1),
      emit: { type: 'level', action: String(level) }
    })),
    'Global Options': [{
      hotkey: 'c',
      icon: '📑️',
      label: 'Load Map',
      emit: { type: 'global', action: 'load' }
    }, {
      hotkey: 'g',
      icon: '🧭️',
      label: 'Global North Offset',
      emit: { type: 'global', action: 'north' }
    }, {
      hotkey: 'e',
      icon: '📂',
      label: 'Export Tour',
      emit: { type: 'global', action: 'export' }
    }, {
      hotkey: '+',
      icon: '➕',
      label: 'Add Scene',
      emit: { type: 'global', action: 'add' }
    }],
    'Current Scene': [{
      hotkey: 'r',
      icon: '🏷️',
      label: 'Rename Scene',
      emit: { type: 'scene', action: 'rename' }
    }, {
      hotkey: 'x',
      icon: '️🗑️',
      label: 'Delete Scene',
      emit: { type: 'scene', action: 'delete' }
    }, {
      hotkey: '0',
      icon: '🌟',
      label: 'Jump to Default (⎇ Alt + d to make current scene default)',
      emit: { type: 'scene', action: 'default' },
      class: props.scene === state.config?.default.scene ? 'active' : '',
    }],
    'Minimap Position': [{
      hotkey: 'h',
      icon: '⬅️',
      label: 'Move Left',
      emit: { type: 'move', action: 'left' }
    }, {
      hotkey: 'j',
      icon: '⬇️',
      label: 'Move Down',
      emit: { type: 'move', action: 'down' }
    }, {
      hotkey: 'k',
      icon: '⬆️',
      label: 'Move Up',
      emit: { type: 'move', action: 'up' }
    }, {
      hotkey: 'l',
      icon: '➡️',
      label: 'Move Right',
      emit: { type: 'move', action: 'right' }
    }],
    'North Offset': [{
      hotkey: '<',
      icon: '↪️',
      label: 'Shift North Counterclockwise (⎇ Alt + < for fine shifting)',
      emit: { type: 'shift', action: 'counterclockwise' }
    }, {
      hotkey: '>',
      icon: '↩️',
      label: 'Shift North Clockwise (⎇ Alt + > for fine shifting)',
      emit: { type: 'shift', action: 'clockwise' }
    }],
  };
});

function onClick(action: ToolbarAction, alt: boolean) {
  if (action.emit) {
    emit('action', {...action.emit, alt: alt });
  }
}

const keyAlternatives: {[key: string]: string} = {
  'ArrowLeft': 'h',
  'ArrowDown': 'j',
  'ArrowUp': 'k',
  'ArrowRight': 'l',
  'a': 'h',
  's': 'j',
  'w': 'k',
  'd': 'l'
};

const listener = (evt: KeyboardEvent) => {
  if (evt.ctrlKey || props.editorActive) {
    return;
  }

  let action = Object.values(actions.value).flat().find(e => e.hotkey === String(evt.key).toLowerCase());
  if (!action && keyAlternatives[evt.key]) {
    action = Object.values(actions.value).flat().find(e => e.hotkey === String(keyAlternatives[evt.key]).toLowerCase());
  }

  if (action) {
    action.emit.alt = evt.altKey;
    emit('action', action.emit);
  } else if (evt.key === 'Escape') {
    emit('action', { type: 'view', action: 'scene' })
  } else if (evt.key === 'Tab') {
    const views = actions.value['View'];
    emit('action', views[(views.findIndex(e => e.emit.action === props.view) + 1) % views.length].emit);
  }
};

onMounted(() => window.addEventListener('keydown', listener));
onUnmounted(() => window.removeEventListener('keydown', listener));
</script>
