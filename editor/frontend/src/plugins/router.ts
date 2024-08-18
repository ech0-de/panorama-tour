import { uniqueNamesGenerator, adjectives, colors, animals } from 'unique-names-generator';
import { createWebHistory, createRouter } from 'vue-router';

import PanoramaTour from '../components/PanoramaTour.vue';

const routes = [{
  path: '/',
  redirect: () => {
    const tourId = uniqueNamesGenerator({
      dictionaries: [adjectives, colors, animals],
      separator: '-'
    });

    return { path: ['', tourId, '0', '7f56d3744f078c739a534a40eb82b07c816de333', 'scene'].join('/') };
  }
}, {
  path: '/:tour/',
  redirect: (to: any) => {
    return { path: ['', to.params.tour, '0', 'default', 'scene'].join('/') };
  }
}, {
  name: 'editor',
  path: '/:tour/:level/:scene/:view',
  component: PanoramaTour
}];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;