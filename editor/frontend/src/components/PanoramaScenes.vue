<template>
  <div class="pt-linking" v-show="props.view === 'linking'">
    <div class="pt-legend">
      <label style="--clr: #00bcd4">current scene</label>
      <label style="--clr: #ff80ab">linked scene</label>
      <label style="--icon: '🖯'">switch scene <small>(left click)</small></label>
      <label style="--icon: '🖰'">toggle link <small>(right click)</small></label>

      <label v-for="(level, i) in levels" :key="i" :style="`--clr: #0078d7; ${level.style}`" :title="`level ${level.level}`">
        level <i :class="level.class">{{ level.icon }}</i>
      </label>
    </div>
    <v-network-graph :zoom-level="0.5" :nodes="nodes" :edges="edges" :layouts="layouts" :configs="configs" :event-handlers="eventHandlers" :selected-nodes="[props.scene]">
      <template #override-node="{ nodeId, scale, config, ...slotProps }">
        <rect :x="config.width * scale * 1.30 * -0.5" :y="config.height * scale * 1.30 * -0.5" :rx="config.borderRadius" :ry="config.borderRadius" :width="config.width * scale * 1.30" :height="config.height* scale * 1.30" :stroke="config.strokeColor" :stroke-width="config.strokeWidth" :stroke-dasharray="config.strokeDasharray" v-if="config.strokeWidth" :style="nodes[nodeId].hidden ? 'opacity: .5' : ''" />
        <rect :x="config.width * scale * -0.5" :y="config.height * scale * -0.5" :rx="config.borderRadius" :ry="config.borderRadius" :width="config.width * scale" :height="config.height* scale" :fill="config.color" v-bind="slotProps" :style="`${nodes[nodeId].style}${nodes[nodeId].hidden ? 'opacity: .5' : ''}`" />
        <text font-family="emoji" :font-size="22 * scale" fill="#ffffff" text-anchor="middle" dominant-baseline="central" style="pointer-events: none" :style="`${nodeId === state.config?.default.scene ? '' : nodes[nodeId].style}${nodes[nodeId].hidden ? 'opacity: .5' : ''}`">
          {{ nodes[nodeId].icon }}
        </text>
      </template>
    </v-network-graph>
  </div>
</template>

<script setup lang="ts">
import { EventHandlers, Layouts, defineConfigs } from 'v-network-graph';
import { graphlib, layout } from '@dagrejs/dagre';
import { computed } from 'vue';

import { useEditorState } from '../plugins/store';
import { EditorView, Action, NUMBER_EMOJI } from '../util/types';

const state = useEditorState();

const props = defineProps<{
  view: EditorView,
  level: number,
  scene: string
}>();

const emit = defineEmits<{
  action: [emit: Action]
}>();

const levels = computed<{level: number, icon: string, class: string, style: string}[]>(() => {
  if (!state.config) {
    return [];
  }

  return [...new Set(
    Object.values(state.config.map?.elements || {})
      .map(e => e.type === 'way' && typeof(e.tags?.['indoor:level']) !== 'undefined' ? Number(e.tags['indoor:level']) : undefined)
  )].filter(e => typeof e === 'number').sort().map((l, i, all) => ({
    level: l,
    icon: NUMBER_EMOJI[Math.abs(l)],
    class: l < 0 ? 'negative' : '',
    style: `filter: hue-rotate(${150 - Math.round(i * (360/all.length))}deg);`,
  }));
});

const nodes = computed(() => {
  if (!state.config) {
    return {};
  }

  const levelMap = Object.fromEntries(levels.value.map(l => [String(l.level), l]));
  const currentRelations = new Set(state.config?.scenes?.[props.scene]?.relations || []);

  return Object.fromEntries(
    Object.entries(state.config.scenes).map(([id, scene]) => [id, {
      id: id,
      name: scene.title || id.slice(0, 8),
      style: levelMap[scene.level]?.style,
      icon: id === state.config?.default.scene ? '✨' : (levelMap[scene.level]?.icon || ''),
      linked: currentRelations.has(id),
      hidden: scene.hidden || false,
    }])
  );
});
const edges = computed(() => {
  if (!state.config) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(state.config.scenes)
      .flatMap(([id, scene]) => (scene.relations || []).map((target: string) => [
        `edge:${id}:${target}`, {
          source: id,
          target: target,
        }
      ]))
  );
});

const configs = computed(() => defineConfigs({
  view: {
    scalingObjects: true,
    doubleClickZoomEnabled: false,
    autoPanAndZoomOnLoad: 'fit-content',
  },
  node: {
    draggable: false,
    selectable: true,
    focusring: {
      color: '#00bcd4'
    },
    normal: {
      type: 'rect',
      color: '#0078d7',
      strokeColor: '#ff80ab',
      strokeDasharray: (node) => node.hidden ? 10 : 0,
      strokeWidth: (node) => node.linked ? 4 : 0
    },
    label: {
      visible: true,
      background: 'rgba(0,0,0,0.8)',
      fontFamily: (node) => node?.unnamed ? 'monospace' : undefined,
      color: (node) => node?.unnamed ? '#cfcfcf' : '#ffffff',
      margin: 7
    }
  },
  edge: {
    summarize: (edges) => Object.keys(edges).length === 2,
    summarized: {
      label: {
        color: 'transparent'
      },
      shape: {
        strokeWidth: 0,
        color: 'transparent'
      },
      stroke: {
        width: 2,
        color: '#ffffff'
      }
    },
    normal: {
      dasharray: '3',
      color: '#ff0000'
    }
  }
}));

const layouts = computed(() => {
  const res = { nodes: {} } as Layouts;
  const nodeSize = 25;

  if (Object.keys(nodes.value).length <= 1 || Object.keys(edges.value).length == 0) {
    return res;
  }

  const g = new graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: 'LR',
    nodesep: nodeSize * 2,
    edgesep: nodeSize,
    ranksep: nodeSize * 2,
  });

  Object.keys(nodes.value).forEach((id) => g.setNode(id, { width: nodeSize, height: nodeSize }));
  Object.values(edges.value).forEach(edge => g.setEdge(edge.source, edge.target));

  layout(g);

  g.nodes().forEach((nodeId: string) => {
    res.nodes[nodeId] = {
      x: g.node(nodeId).x,
      y: g.node(nodeId).y
    };
  })

  return res;
});

const eventHandlers: EventHandlers = {
  'node:click': ({ node }) => {
    emit('action', { type: 'scene', action: node });
  },
  'node:contextmenu': ({ node, event }) => {
    event.preventDefault();
    emit('action', { type: 'link', action: node });
  }
}
</script>

<style>
.pt-linking {
  position: absolute !important;
  top: 0px;
  left: 0px;
  right: 0px;
  width: 100vw;
  height: 100vh;
  display: block;
  background-color: rgba(0, 0, 0, 0.85);
  transition: 0.5s;
  z-index: 999;
}

.pt-linking text.negative {
  position: relative;
}

.pt-linking text.negative::before {
  content: "-";
  position: absolute;
  font-weight: bolder;
  left: 4px;
  top: 2px;
  font-size: 75%;
}
</style>