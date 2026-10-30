/**
 * Encodes values as strings that are equal for equal values. Plain objects and
 * arrays are compared structurally; other objects, functions, and symbols are
 * compared by identity.
 */
export class StructuralKeys {
  readonly #identities = new WeakMap<object, number>();
  readonly #symbols = new Map<symbol, number>();
  #nextIdentity = 0;

  /** Encodes `value`. Throws if it is cyclic. */
  of(value: unknown): string {
    return this.#key(value, new Set());
  }

  /** Forgets the symbols encoded so far. */
  clear(): void {
    this.#symbols.clear();
  }

  #identity(value: object): number {
    let identity = this.#identities.get(value);
    if (identity === undefined) {
      identity = ++this.#nextIdentity;
      this.#identities.set(value, identity);
    }
    return identity;
  }

  #key(value: unknown, ancestors: Set<object>): string {
    if (value === null) return 'null';
    switch (typeof value) {
      case 'undefined':
        return 'undefined';
      case 'boolean':
        return value ? 'true' : 'false';
      case 'string':
        return JSON.stringify(value);
      case 'number':
        return `number:${Object.is(value, -0) ? '-0' : String(value)}`;
      case 'bigint':
        return `bigint:${String(value)}`;
      case 'symbol': {
        let identity = this.#symbols.get(value);
        if (identity === undefined) {
          identity = ++this.#nextIdentity;
          this.#symbols.set(value, identity);
        }
        return `symbol:${String(identity)}`;
      }
      case 'function':
        return `identity:${String(this.#identity(value))}`;
      case 'object': {
        const array = Array.isArray(value);
        const prototype: unknown = Object.getPrototypeOf(value);
        if (!array && prototype !== Object.prototype && prototype !== null)
          return `identity:${String(this.#identity(value))}`;
        if (ancestors.has(value))
          throw new TypeError(
            'Cyclic keys are not supported. Caches can derive a custom key from their arguments.',
          );
        ancestors.add(value);
        const result = array
          ? `array:${String(value.length)}[${value.map((item: unknown) => this.#key(item, ancestors)).join(',')}]`
          : `{${Object.keys(value)
              .sort()
              .map(
                (key) =>
                  `${JSON.stringify(key)}:${this.#key((value as Record<string, unknown>)[key], ancestors)}`,
              )
              .join(',')}}`;
        ancestors.delete(value);
        return result;
      }
    }
    throw new TypeError('Unsupported key');
  }
}
