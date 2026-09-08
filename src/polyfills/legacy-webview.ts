const toIntegerOrInfinity = (value: number): number => {
  const numericValue = Number(value);

  if (Number.isNaN(numericValue) || numericValue === 0) {
    return 0;
  }

  return numericValue < 0 ? Math.ceil(numericValue) : Math.floor(numericValue);
};

if (!Array.prototype.at) {
  Object.defineProperty(Array.prototype, 'at', {
    configurable: true,
    writable: true,
    value<T>(this: T[], index: number): T | undefined {
      const relativeIndex = toIntegerOrInfinity(index);
      const resolvedIndex =
        relativeIndex >= 0 ? relativeIndex : this.length + relativeIndex;

      if (resolvedIndex < 0 || resolvedIndex >= this.length) {
        return undefined;
      }

      return this[resolvedIndex];
    }
  });
}

if (!Array.prototype.findLastIndex) {
  Object.defineProperty(Array.prototype, 'findLastIndex', {
    configurable: true,
    writable: true,
    value<T>(
      this: T[],
      predicate: (value: T, index: number, array: T[]) => unknown,
      thisArg?: unknown
    ): number {
      if (typeof predicate !== 'function') {
        throw new TypeError('predicate must be a function');
      }

      for (let index = this.length - 1; index >= 0; index -= 1) {
        if (predicate.call(thisArg, this[index], index, this)) {
          return index;
        }
      }

      return -1;
    }
  });
}

if (!String.prototype.replaceAll) {
  Object.defineProperty(String.prototype, 'replaceAll', {
    configurable: true,
    writable: true,
    value(
      this: string,
      searchValue: string | RegExp,
      replaceValue: string | ((substring: string, ...args: unknown[]) => string)
    ): string {
      if (searchValue instanceof RegExp) {
        if (!searchValue.global) {
          throw new TypeError(
            'replaceAll requires a global regular expression'
          );
        }

        return String(this).replace(searchValue, replaceValue as string);
      }

      const escapedSearchValue = String(searchValue).replace(
        /[.*+?^${}()|[\]\\]/g,
        '\\$&'
      );

      return String(this).replace(
        new RegExp(escapedSearchValue, 'g'),
        replaceValue as string
      );
    }
  });
}

export {};
