import { latLngBounds } from 'leaflet';
import { defineStore } from 'pinia';

import { EditorState } from '../util/types.ts';

export const useEditorState = defineStore('state', {
  state: (): EditorState => ({
    config: null
  }),

  getters: {
  },

  actions: {
    loadMap(data: any) {
      if (!this.config) {
        return;
      }

      if (Array.isArray(data)) {
        // could be elements array
        if (!data.every(x => x?.type === 'node' || x?.type === 'way')) {
          throw new Error('invalid format provided');
        }
        this.config.map.elements = data;

        const bounds = latLngBounds(data.filter(e => e.type ==='node').map(e => [e.lat, e.lon])).pad(0.1);
        this.config.map.center = {
          lat: bounds.getCenter().lat,
          lng: bounds.getCenter().lng
        };
        this.config.map.maxBounds = [
          [bounds.getNorthEast().lat, bounds.getNorthEast().lng],
          [bounds.getSouthWest().lat, bounds.getSouthWest().lng]
        ];

        const boundary = latLngBounds(data.filter(e => e.type ==='node').map(e => [e.lat, e.lon])).pad(0.05);

        this.config.map.polygons = [
          [
            [boundary.getNorthEast().lat, boundary.getNorthEast().lng],
            [boundary.getNorthWest().lat, boundary.getNorthWest().lng],
            [boundary.getSouthWest().lat, boundary.getSouthWest().lng],
            [boundary.getSouthEast().lat, boundary.getSouthEast().lng]
          ]
        ];
      } else if (data?.elements && data?.center) {
        this.config.map.attributionControl = data.attributionControl || this.config.map.attributionControl;
        this.config.map.zoomControl = data.zoomControl || this.config.map.zoomControl;
        this.config.map.zoom = data.zoom || this.config.map.zoom;
        this.config.map.minZoom = data.minZoom || this.config.map.minZoom;
        this.config.map.maxZoom = data.maxZoom || this.config.map.maxZoom;
        this.config.map.center = data.center || this.config.map.center;
        this.config.map.maxBounds = data.maxBounds || this.config.map.maxBounds;
        this.config.map.maxBoundsViscosity = data.maxBoundsViscosity || this.config.map.maxBoundsViscosity;
        this.config.map.elements = data.elements || this.config.map.elements;
        this.config.map.polygons = data.polygons || this.config.map.polygons;
      }
    },

    updateMap(data: any) {
      if (!this.config) {
        return;
      }

      if (Array.isArray(data)) {
        // could be elements array
        if (!data.every(x => x?.type === 'node' || x?.type === 'way')) {
          throw new Error('invalid format provided');
        }
        this.config.map.elements = data;

        const bounds = latLngBounds(data.filter(e => e.type ==='node').map(e => [e.lat, e.lon])).pad(0.1);
        this.config.map.center = {
          lat: bounds.getCenter().lat,
          lng: bounds.getCenter().lng
        };
        this.config.map.maxBounds = [
          [bounds.getNorthEast().lat, bounds.getNorthEast().lng],
          [bounds.getSouthWest().lat, bounds.getSouthWest().lng]
        ];

        const boundary = latLngBounds(data.filter(e => e.type ==='node').map(e => [e.lat, e.lon])).pad(0.05);

        this.config.map.polygons = [
          [
            [boundary.getNorthEast().lat, boundary.getNorthEast().lng],
            [boundary.getNorthWest().lat, boundary.getNorthWest().lng],
            [boundary.getSouthWest().lat, boundary.getSouthWest().lng],
            [boundary.getSouthEast().lat, boundary.getSouthEast().lng]
          ]
        ];
      } else if (data?.elements && data?.center) {
        this.config.map.attributionControl = data.attributionControl || this.config.map.attributionControl;
        this.config.map.zoomControl = data.zoomControl || this.config.map.zoomControl;
        this.config.map.zoom = data.zoom || this.config.map.zoom;
        this.config.map.minZoom = data.minZoom || this.config.map.minZoom;
        this.config.map.maxZoom = data.maxZoom || this.config.map.maxZoom;
        this.config.map.center = data.center || this.config.map.center;
        this.config.map.maxBounds = data.maxBounds || this.config.map.maxBounds;
        this.config.map.maxBoundsViscosity = data.maxBoundsViscosity || this.config.map.maxBoundsViscosity;
        this.config.map.elements = data.elements || this.config.map.elements;
        this.config.map.polygons = data.polygons || this.config.map.polygons;
      } else {
        throw new Error('invalid map config format');
      }
    },

    moveScene(scene: string, direction: string) {
      if (this.config?.scenes[scene]) {
        let heading = 0;

        switch (direction) {
          case 'left':
            heading = 270;
            break;
          case 'right':
            heading = 90;
            break;
          case 'down':
            heading = 180;
            break;
        }

        const distance = 1;

        const rad = Math.PI / 180;
        const radInv = 180 / Math.PI;
        const R = 6378137; // approximation of Earth's radius
        const lon1 = this.config.scenes[scene].lon * rad;
        const lat1 = this.config.scenes[scene].lat * rad;
        const rheading = heading * rad;

        const sinLat1 = Math.sin(lat1);
        const cosLat1 = Math.cos(lat1);
        const cosDistR = Math.cos(distance / R);
        const sinDistR = Math.sin(distance / R);

        let lat2 = Math.asin(sinLat1 * cosDistR + cosLat1 * sinDistR * Math.cos(rheading));
        let lon2 = lon1 + Math.atan2(Math.sin(rheading) * sinDistR * cosLat1, cosDistR - sinLat1 * Math.sin(lat2));

        lon2 = lon2 * radInv;
        lon2 = lon2 > 180 ? lon2 - 360 : lon2 < -180 ? lon2 + 360 : lon2;

        this.config.scenes[scene].lon = lon2;
        this.config.scenes[scene].lat = lat2 * radInv;
      }
    },
    moveSceneLevel(scene: string, newLevel: number) {
      if (this.config?.scenes[scene]) {
        this.config.scenes[scene].level = newLevel;
      }
    },
    shiftScene(scene: string, direction: string, alt: boolean) {
      if (this.config?.scenes[scene]) {
        const amount = (alt ? 1 : 5) * (direction === 'clockwise' ? 1 : -1);
        this.config.scenes[scene].northOffset = (this.config.scenes[scene].northOffset || 0) + amount;
      }
    },
    renameScene(scene: string, newTitle: string) {
      if (this.config?.scenes[scene]) {
        this.config.scenes[scene].title = newTitle;
      }
    },
    deleteScene(scene: string) {
      if (this.config?.scenes[scene]) {
        if (this.config?.default.scene === scene) {
          throw new Error('You cannot delete the default scene!');
        }
        delete this.config.scenes[scene];
      }
    },
    linkScene(scene: string, other: string) {
      if (this.config?.scenes[scene] && this.config?.scenes[other]) {
        if (!Array.isArray(this.config.scenes[scene].relations)) {
          this.config.scenes[scene].relations = [];
        }
        if (!Array.isArray(this.config.scenes[other].relations)) {
          this.config.scenes[other].relations = [];
        }

        const indexScene = this.config.scenes[scene].relations.indexOf(other);
        const indexOther = this.config.scenes[other].relations.indexOf(scene);

        if (indexScene >= 0 || indexOther >= 0) {
          if (indexScene >= 0) {
            this.config.scenes[scene].relations.splice(indexScene, 1);
          }
          if (indexOther >= 0) {
            this.config.scenes[other].relations.splice(indexOther, 1);
          }
        } else {
          this.config.scenes[scene].relations.push(other);
          this.config.scenes[other].relations.push(scene);
        }
      }
    },
    makeDefault(scene: string) {
      if (this.config?.scenes[scene]) {
        this.config.default.scene = scene;
      }
    },
    setGlobalNorth(newNorth: number) {
      if (this.config?.default) {
        this.config.default.north = newNorth;
      }
    }
  }
});