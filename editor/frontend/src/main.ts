import { createApp } from 'vue';
import VNetworkGraph from 'v-network-graph';

import 'pannellum/build/pannellum.css';
import 'v-network-graph/lib/style.css';
import 'leaflet/dist/leaflet.css';
import './style.css';

import App from './App.vue';
import router from './plugins/router.ts';
import syncedStore from './plugins/sync.ts';

const app = createApp(App);
app.use(VNetworkGraph);
app.use(syncedStore);
app.use(router);
app.mount('#app');
