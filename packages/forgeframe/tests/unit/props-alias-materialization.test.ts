/**
 * Pure unit tests for canonical alias materialization.
 */
import { describe, expect, it } from 'vitest';
import { PROP_RESET } from '@/core/consumer/props-pipeline';
import { materializePropAliases } from '@/props/normalize';
import type { PropsDefinition } from '@/types';

type ChainedAliasProps = {
  first?: string;
  second?: string;
};

const CHAINED_ALIAS_DEFINITIONS: PropsDefinition<ChainedAliasProps> = {
  first: { alias: 'second' },
  second: { alias: 'legacy' },
};

describe('materializePropAliases', () => {
  it('should resolve alias chains transitively', () => {
    expect(
      materializePropAliases({ legacy: 'v1' }, CHAINED_ALIAS_DEFINITIONS)
    ).toEqual({
      first: 'v1',
      second: 'v1',
    });
  });

  it('should preserve canonical precedence and explicit undefined values', () => {
    expect(
      materializePropAliases(
        { second: 'middle', legacy: 'ignored' },
        CHAINED_ALIAS_DEFINITIONS
      )
    ).toEqual({
      first: 'middle',
      second: 'middle',
    });

    expect(
      materializePropAliases(
        { first: 'top', second: 'middle', legacy: 'ignored' },
        CHAINED_ALIAS_DEFINITIONS
      )
    ).toEqual({
      first: 'top',
      second: 'middle',
    });

    expect(
      materializePropAliases(
        { legacy: undefined },
        CHAINED_ALIAS_DEFINITIONS
      )
    ).toEqual({
      first: undefined,
      second: undefined,
    });
  });

  it('should replace transitive reset markers with concrete alias values', () => {
    expect(
      materializePropAliases(
        {
          first: PROP_RESET,
          second: PROP_RESET,
          legacy: 'restored',
        },
        CHAINED_ALIAS_DEFINITIONS,
        PROP_RESET
      )
    ).toEqual({
      first: 'restored',
      second: 'restored',
    });
  });

  it('should terminate cycles while preserving direct canonical anchors', () => {
    const cyclicDefinitions: PropsDefinition<ChainedAliasProps> = {
      first: { alias: 'second' },
      second: { alias: 'first' },
    };

    expect(materializePropAliases({ first: 'anchored' }, cyclicDefinitions)).toEqual({
      first: 'anchored',
      second: 'anchored',
    });
    expect(
      materializePropAliases(
        { first: 'top', second: 'middle' },
        cyclicDefinitions
      )
    ).toEqual({
      first: 'top',
      second: 'middle',
    });
  });
});
