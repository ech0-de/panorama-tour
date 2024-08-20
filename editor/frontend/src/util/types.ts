import { LatLngExpression, MapOptions } from 'leaflet';
import 'pannellum';

export type EditorView = 'scene' | 'linking' | 'map';

export type SceneConfig = Pannellum.GeneralOptions & {
  relations: string[]
  panorama: string,
  hidden?: boolean,
  level: number,
  lat: number,
  lon: number
};

export type DefaultConfig = {
  scene: string,
  level: number,
  north: number
};

export type BuildingNodeType = {
  type: 'node',
  id: string,
  lat: number,
  lon: number
};
export type BuildingWayType = {
  type: 'way',
  id: string,
  nodes: string[],
  tags: { [key: string]: any }
};

export type MapConfig = MapOptions & {
  elements: (BuildingNodeType|BuildingWayType)[],
  polygons: LatLngExpression[][]
};

export type Config = {
  scenes: {[type: string]: SceneConfig},
  default: DefaultConfig,
  map: MapConfig,
};

export interface EditorState {
  presence: {[key: string]: string},
  config: null | Config
};

export type Action = {
  type: string,
  action: string,
  alt?: boolean
};

export const NUMBER_EMOJI = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
export const COLOR_PALETTE = ['#7d1f8d', '#522e92', '#324191', '#0a6ab6', '#0287c3', '#0096aa', '#00786d', '#3d8c40', '#719331', '#967000', '#cc7a00'];