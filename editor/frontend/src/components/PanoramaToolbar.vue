<template>
  <div id="toolbar">
    <fieldset v-for="(group, label) in actions" :key="label">
      <label>{{ label }}</label>
      <button v-for="(a, i) in group" :key="i" :aria-keyshortcuts="a.hotkey" @contextmenu.prevent="onClick(a, $event, true)" @click="onClick(a, $event, false)" :class="a.class" :title="a.label" :style="a.style">{{ a.icon }}</button>
    </fieldset>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, computed } from 'vue';

import { useEditorState } from '../plugins/store';
import { Action, EditorView, NUMBER_EMOJI, buildingLevels } from '../util/types';

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
  if (!state.config) {
    return {} as {[key: string]: ToolbarAction[]};
  }

  const levels = buildingLevels(Object.values(state.config.map?.elements || {}));

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
    'Building Levels': levels.map((level, i, all) => ({
      class: `${props.level === level ? 'active' : ''} ${level < 0 ? 'negative' : ''}`,
      style: `filter: hue-rotate(${150 - Math.round(i * (360/all.length))}deg);`,
      icon: NUMBER_EMOJI[Math.abs(level)],
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
      label: 'Export Tour (⎇ Alt + e to only export HTML)',
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
    }, {
      hotkey: '/',
      icon: '🪜',
      label: 'Toggle Intermediate Level Mode',
      emit: { type: 'scene', action: 'intermediate' },
      class: state.config?.scenes[props.scene]?.intermediate ? 'active' : '',
    }, {
      hotkey: '.',
      icon: state.config?.scenes?.[props.scene]?.hidden ? '📀' : '💿',
      label: `${state.config?.scenes?.[props.scene]?.hidden ? 'Show' : 'Hide'} Scene when Exporting`,
      emit: { type: 'scene', action: 'hide' }
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
    'Horizon': [{
      hotkey: 'u',
      icon: '↙️',
      style: `filter: hue-rotate(300deg);`,
      label: 'Pitch Horizon Left (⎇ Alt + . for fine pitching)',
      emit: { type: 'pitch', action: 'left' }
    }, {
      hotkey: 'i',
      icon: '↘️',
      style: `filter: hue-rotate(300deg);`,
      label: 'Pitch Hirzon Right (⎇ Alt + , for fine pitching)',
      emit: { type: 'pitch', action: 'right' }
    }, {
      hotkey: 'o',
      icon: '↙️',
      style: `filter: hue-rotate(150deg);`,
      label: 'Tilt Horizon Left (⎇ Alt + . for fine tilting)',
      emit: { type: 'tilt', action: 'left' }
    }, {
      hotkey: 'p',
      icon: '↘️',
      style: `filter: hue-rotate(150deg);`,
      label: 'Tilt Horizon Right (⎇ Alt + , for fine tilting)',
      emit: { type: 'tilt', action: 'right' }
    }]
  };
});

function onClick(action: ToolbarAction, evt: MouseEvent, alt: boolean) {
  if (evt?.altKey) {
    alt = true;
  }

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
