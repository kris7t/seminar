type Handler = ((event: never) => void) | undefined;

type Handlers<T> = { [K in keyof T]: Handler };

/**
 * Combines the event handlers of several hooks for the same element. Handlers
 * of the same event are called in order.
 */
export function composeHandlers<A extends Handlers<A>, B extends Handlers<B>>(
  a: A,
  b: B,
): A & B {
  const first: Record<string, Handler> = a;
  const composed: Record<string, Handler> = { ...a };
  for (const [name, second] of Object.entries<Handler>(b)) {
    const handler = first[name];
    composed[name] =
      handler === undefined || second === undefined
        ? (second ?? handler)
        : (event: never) => {
            handler(event);
            second(event);
          };
  }
  return composed as A & B;
}
