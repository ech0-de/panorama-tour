import { applyPatch, compare } from 'fast-json-patch';
import { debounce } from 'ts-debounce';
import { createPinia } from 'pinia';
import { watch, toRaw } from 'vue';

const pinia = createPinia();

pinia.use(({ store, app }) => {
  const queue = [] as any[];
  let socket = null as (null | WebSocket);
  let retransmitTimeout = 100;
  let reconnectTimeout = 500;

  function sendQueue() {
    if (queue.length === 0) {
      // nothing to send
      return;
    }

    try {
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        throw new Error('socket not ready');
      }

      socket?.send(JSON.stringify({ type: 'update', data: queue[0] }));
      queue.shift();
      retransmitTimeout = 100;
    } catch (e) {
      // retry
      console.log(e);
      retransmitTimeout *= 2;
      setTimeout(sendQueue, retransmitTimeout);
    }
  }

  function connect() {
    try {
      const tourId = location.pathname.split('/')?.[1];

      if (!tourId || !(tourId?.length > 1)) {
        throw new Error('tour id not yet specified');
      }

      const ws = new WebSocket(`${location.origin.replace('http', 'ws')}/tours/${tourId}`);
      ws.addEventListener('open', () => {
        console.log('[ws] connected');
        // reset timeout
        retransmitTimeout = 100;
        reconnectTimeout = 500;
        socket = ws;
      });

      ws.addEventListener('message', (e) => {
        try {
          const msg = JSON.parse(e.data);
          switch (msg.type) {
            case 'snapshot': {
              store.$patch({ config: msg.data, presence: msg.presence });
              break;
            }

            case 'update': {
              store.$patch((state) => applyPatch(state.config, msg.data));
              break;
            }

            case 'presence': {
              store.$patch((state) => {
                if (msg.scene) {
                  state.presence[msg.id] = msg.scene;
                } else {
                  delete state.presence[msg.id];
                }
              });
              break;
            }
          }
        } catch (err) {
          console.error('[ws] error', err);
        }
      });

      ws.addEventListener('close', (e) => {
        console.log('[ws] closed, attempt reconnect', e.reason);
        reconnectTimeout = reconnectTimeout * 2;
        setTimeout(() => connect(), reconnectTimeout);
      });

      ws.addEventListener('error', (err) => {
        console.error('[ws] error', err);
        ws.close();
      });
    } catch (e) {
      console.error('[ws] setup error', e);
      reconnectTimeout = reconnectTimeout * 2;
      setTimeout(() => connect(), reconnectTimeout);
    }
  }

  connect();

  let previousState = structuredClone(toRaw(store.$state.config));

  const debouncedSubscription = debounce((evt) => {
    const clone = structuredClone(toRaw(store.$state.config));
    if (previousState && (evt.type !== 'patch object' && evt.type !== 'patch function')) {
      const changes = compare(previousState, clone);
      if (changes.length) {
        queue.push(changes);
        sendQueue();
      }
    }

    previousState = clone;
  }, 250);

  watch(() => app?.config?.globalProperties?.$route, (route) => {
    console.log('blubb', route?.params.scene);
    queue.push({ presence: route?.params.scene });
    sendQueue();
  });

  store.$subscribe((evt) => debouncedSubscription(evt));
});

export default pinia;