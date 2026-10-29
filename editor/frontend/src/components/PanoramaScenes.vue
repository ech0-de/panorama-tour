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
        <!-- there are no emojis for negative numbers, and svg text has no ::before like the legend and toolbar use -->
        <text v-if="nodes[nodeId].negative" :x="-5.5 * scale" :y="-1 * scale" font-weight="bolder" :font-size="16 * scale" fill="#ffffff" text-anchor="middle" dominant-baseline="central" style="pointer-events: none" :style="`${nodes[nodeId].style}${nodes[nodeId].hidden ? 'opacity: .5' : ''}`">-</text>
      </template>
    </v-network-graph>
  </div>
</template>

<script setup lang="ts">
import { EventHandlers, Layouts, defineConfigs } from 'v-network-graph';
import { graphlib, layout } from '@dagrejs/dagre';
import { computed } from 'vue';

import { useEditorState } from '../plugins/store';
import { EditorView, Action, NUMBER_EMOJI, buildingLevels } from '../util/types';

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

  return buildingLevels(Object.values(state.config.map?.elements || {})).map((l, i, all) => ({
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
      icon: id === state.config?.default.scene
        ? '✨'
        : (scene?.intermediate ? '🪜' : (levelMap[scene.level]?.icon || '')),
      negative: id !== state.config?.default.scene && !scene?.intermediate && scene.level < 0 && Boolean(levelMap[scene.level]),
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

// sizes as rendered by v-network-graph: 32px rect (scaled by 1.3 for the link outline)
// and a label with background below it
const NODE_SIZE = 32 * 1.3;
const LABEL_FONT_SIZE = 11;
const LABEL_HEIGHT = LABEL_FONT_SIZE * 1.1 + 4;
const LABEL_MARGIN = 7;

const measureContext = document.createElement('canvas').getContext('2d');
function labelWidth(text: string): number {
  if (!measureContext) {
    return text.length * LABEL_FONT_SIZE * 0.6;
  }

  measureContext.font = `${LABEL_FONT_SIZE}px ${getComputedStyle(document.body).fontFamily}`;
  return measureContext.measureText(text).width + 8;
}

const layouts = computed(() => {
  const res = { nodes: {} } as Layouts;

  if (Object.keys(nodes.value).length <= 1) {
    return res;
  }

  // reserve space for node and label, so labels don't overlap neighbouring nodes
  const boxWidth = (name: string) => Math.max(NODE_SIZE, labelWidth(name));
  const boxHeight = NODE_SIZE + LABEL_MARGIN + LABEL_HEIGHT;
  // boxes are centered, but the node itself sits above its label
  const labelOffset = (LABEL_MARGIN + LABEL_HEIGHT) / 2;

  const validEdges = Object.values(edges.value).filter(e => nodes.value[e.source] && nodes.value[e.target]);
  const linked = new Set(validEdges.flatMap(e => [e.source, e.target]));
  const isolated = Object.values(nodes.value).filter(node => !linked.has(node.id));

  let bottom = 0;
  if (linked.size) {
    const g = new graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({
      rankdir: 'LR',
      nodesep: NODE_SIZE * 0.5,
      edgesep: NODE_SIZE * 0.5,
      ranksep: NODE_SIZE * 1.5,
    });

    linked.forEach((id) => g.setNode(id, { width: boxWidth(nodes.value[id].name), height: boxHeight }));
    validEdges.forEach(edge => g.setEdge(edge.source, edge.target));

    layout(g);

    g.nodes().forEach((nodeId: string) => {
      res.nodes[nodeId] = {
        x: g.node(nodeId).x,
        y: g.node(nodeId).y - labelOffset
      };
    });

    bottom = (g.graph().height || 0) + NODE_SIZE;
  }

  // scenes without links (e.g. right after an import) go into a grid below the graph
  // instead of one long dagre rank
  if (isolated.length) {
    const columns = Math.ceil(Math.sqrt(isolated.length * 2));
    const cellWidth = Math.max(...isolated.map(node => boxWidth(node.name))) + NODE_SIZE * 0.5;
    const cellHeight = boxHeight + NODE_SIZE * 0.5;

    isolated.forEach((node, i) => {
      res.nodes[node.id] = {
        x: (i % columns + 0.5) * cellWidth,
        y: bottom + (Math.floor(i / columns) + 0.5) * cellHeight - labelOffset
      };
    });
  }

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
</style>