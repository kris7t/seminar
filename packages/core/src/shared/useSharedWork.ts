import {
  use,
  useCallback,
  useEffect,
  useEffectEvent,
  useSyncExternalStore,
} from 'react';

import { useTransitionHold } from '../transitions/settling.ts';
import { SETTLE_DEADLINE } from '../transitions/SlideTransitions.ts';
import { useSlideView } from '../view/SlideViewContext.ts';
import type {
  CacheDefinition,
  LoadResult,
  ResourceDefinition,
  ResourceDependencies,
} from './definitions.ts';
import { SharedWorkContext } from './SharedWorkContext.ts';
import type { SharedWorkStore } from './SharedWorkStore.ts';

const NO_RESOURCES: ResourceDependencies = {};

function useStore(): SharedWorkStore {
  const store = use(SharedWorkContext);
  if (store === undefined)
    throw new Error('Shared resources and caches require a Deck');
  return store;
}

/**
 * Acquires a shared resource after commit, including in probes. Its value is
 * shared by all consumers in the Deck and disposed after the Deck unmounts.
 * Visible consumers hold transitions according to the definition.
 */
export function useResource<T>(
  definition: ResourceDefinition<T>,
): LoadResult<T> {
  const store = useStore();
  const { visible } = useSlideView();
  const read = useCallback(
    () => store.readResource(definition),
    [store, definition],
  );
  const subscribe = useCallback(
    (listener: () => void) => store.subscribeResource(definition, listener),
    [store, definition],
  );
  const result = useSyncExternalStore(subscribe, read, read);
  const hold = definition.transitionHold ?? true;
  useTransitionHold(visible && result.pending && hold !== false, {
    deadline: typeof hold === 'number' ? hold : undefined,
  });
  useEffect(() => {
    void store.loadResource(definition);
  }, [store, definition]);
  return result;
}

function useResourceHold(
  store: SharedWorkStore,
  resources: ResourceDependencies,
): number | undefined {
  const read = useCallback(() => {
    let deadline: number | undefined;
    for (const resource of Object.values(resources)) {
      const hold = resource.transitionHold ?? true;
      if (hold !== false && store.readResource(resource).pending) {
        deadline = Math.max(
          deadline ?? 0,
          typeof hold === 'number' ? hold : SETTLE_DEADLINE,
        );
      }
    }
    return deadline;
  }, [store, resources]);
  const subscribe = useCallback(
    (listener: () => void) => {
      const unsubscribers = Object.values(resources).map((resource) =>
        store.subscribeResource(resource, listener),
      );
      return () => {
        for (const unsubscribe of unsubscribers) unsubscribe();
      };
    },
    [store, resources],
  );
  return useSyncExternalStore(subscribe, read, read);
}

/**
 * Shares work by its definition and arguments across slides and views of a
 * Deck. Injected resources load after commit even in probes. The derivation
 * runs only in visible views unless the definition enables it in all views.
 *
 * Results used by a rendered slide stay cached across its step changes. Once
 * its last view leaves, entries follow the definition's retention limit.
 */
export function useCached<Args, T, Resources extends ResourceDependencies>(
  definition: CacheDefinition<Args, T, Resources>,
  args: Args,
): LoadResult<T> {
  const store = useStore();
  const { index, visible } = useSlideView();
  const key = store.cacheKey(definition, args);
  const read = useCallback(
    () => store.readCached<T>(definition, key),
    [store, definition, key],
  );
  const subscribe = useCallback(
    (listener: () => void) => store.subscribeCached(definition, key, listener),
    [store, definition, key],
  );
  const result = useSyncExternalStore(subscribe, read, read);
  const resourceHold = useResourceHold(
    store,
    definition.resources ?? NO_RESOURCES,
  );
  useTransitionHold(visible && resourceHold !== undefined, {
    deadline: resourceHold,
  });
  const hold = definition.transitionHold ?? true;
  useTransitionHold(visible && result.pending && hold !== false, {
    deadline: typeof hold === 'number' ? hold : undefined,
  });
  const request = useEffectEvent(() => {
    store.request(definition, key, args, index, visible);
  });
  useEffect(() => {
    request();
  }, [store, definition, key, index, visible]);
  return result;
}
