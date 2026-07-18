/**
 * confidenceMerge.test.ts
 *
 * Unit tests for `mergeByAscendingConfidence()`, the shared helper
 * extracted from `identitySynthesis.ts` and `voiceMapping.ts` to close
 * ADR-005 finding D-2 (three independent confidence-merge
 * implementations). `identitySynthesis.ts`/`voiceMapping.ts`'s own
 * existing test suites already cover this helper's behavior end-to-end
 * through those two call sites — this file adds direct, implementation-
 * level coverage of the helper itself: sort order, last-write-wins
 * semantics, `undefined`-skipping, empty input, and non-mutation of the
 * input array.
 */

import { describe, it, expect } from 'vitest';
import { mergeByAscendingConfidence } from '../../../src/context/confidenceMerge';

interface Item {
  confidence: number;
  label: string;
}

interface Fields {
  a?: string;
  b?: number;
}

describe('mergeByAscendingConfidence()', () => {
  it('returns an empty object for empty input', () => {
    const result = mergeByAscendingConfidence<Item, Fields>([], () => ({}));
    expect(result).toEqual({});
  });

  it('a higher-confidence item overwrites a lower-confidence item on the same field', () => {
    const items: Item[] = [
      { confidence: 0.9, label: 'high' },
      { confidence: 0.2, label: 'low' },
    ];

    const result = mergeByAscendingConfidence<Item, Fields>(items, (item) => ({ a: item.label }));

    expect(result.a).toBe('high');
  });

  it('processes items in ascending confidence order regardless of input order', () => {
    const items: Item[] = [
      { confidence: 0.5, label: 'mid' },
      { confidence: 0.1, label: 'low' },
      { confidence: 0.9, label: 'high' },
    ];

    const order: string[] = [];
    mergeByAscendingConfidence<Item, Fields>(items, (item) => {
      order.push(item.label);
      return {};
    });

    expect(order).toEqual(['low', 'mid', 'high']);
  });

  it('does not mutate the input array', () => {
    const items: Item[] = [
      { confidence: 0.9, label: 'high' },
      { confidence: 0.1, label: 'low' },
    ];
    const original = [...items];

    mergeByAscendingConfidence<Item, Fields>(items, () => ({}));

    expect(items).toEqual(original);
  });

  it('merges independent fields from different items rather than only keeping the last item entirely', () => {
    const items: Item[] = [
      { confidence: 0.2, label: 'low' },
      { confidence: 0.8, label: 'high' },
    ];

    const result = mergeByAscendingConfidence<Item, Fields>(items, (item) =>
      item.label === 'low' ? { a: 'from-low' } : { b: 42 },
    );

    expect(result).toEqual({ a: 'from-low', b: 42 });
  });

  it('never lets an undefined field value overwrite an already-set value', () => {
    const items: Item[] = [
      { confidence: 0.2, label: 'first' },
      { confidence: 0.9, label: 'second' },
    ];

    const result = mergeByAscendingConfidence<Item, Fields>(items, (item) =>
      item.label === 'first' ? { a: 'set-by-first' } : { a: undefined },
    );

    expect(result.a).toBe('set-by-first');
  });

  it('breaks ties in the original relative order when confidences are equal (stable sort)', () => {
    const items: Item[] = [
      { confidence: 0.5, label: 'first' },
      { confidence: 0.5, label: 'second' },
    ];

    const result = mergeByAscendingConfidence<Item, Fields>(items, (item) => ({ a: item.label }));

    // Array.prototype.sort is stable (ES2019+): equal-confidence items
    // keep their original relative order, so 'second' (processed last)
    // wins.
    expect(result.a).toBe('second');
  });
});
