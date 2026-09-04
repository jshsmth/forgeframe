/**
 * Clone regressions for component snapshots and lifecycle tracking.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  clearComponents,
  create,
  destroyAll,
  destroyByTag,
} from '@/core/component';
import { ConsumerComponent } from '@/core/consumer';
import { getSiblingInstances } from '@/core/consumer/siblings';
import { prop } from '@/props/prop';

type CloneInternals = {
  options: {
    tag: string;
  };
  propsPipeline: {
    props: { token?: string; amount?: number; target?: number };
    inputProps: {
      token?: string;
      amount?: string;
      target?: { value: string | number };
    };
  };
  resolveUrl: () => string;
};

function getCloneInternals(instance: unknown): CloneInternals {
  return instance as CloneInternals;
}

describe('Component clone', () => {
  afterEach(async () => {
    await destroyAll();
    clearComponents();
  });

  it('should preserve the normalized props snapshot', () => {
    let tokenCounter = 0;
    const Component = create<{ token?: string }>({
      tag: 'clone-test',
      url: (props) => `https://example.com/${props.token}`,
      props: {
        token: {
          schema: prop.string().optional(),
          value: () => `token-${++tokenCounter}`,
        },
      },
    });

    const original = Component({});
    const cloned = original.clone();
    const originalInternal = getCloneInternals(original);
    const clonedInternal = getCloneInternals(cloned);

    expect(cloned).not.toBe(original);
    expect(clonedInternal.propsPipeline.props.token).toBe(
      originalInternal.propsPipeline.props.token
    );
    expect(clonedInternal.resolveUrl()).toBe(originalInternal.resolveUrl());
    expect(clonedInternal.propsPipeline.inputProps).toEqual(
      originalInternal.propsPipeline.inputProps
    );
    expect(tokenCounter).toBe(1);
  });

  it('should clone transformed props without validating outputs as inputs', () => {
    const Component = create({
      tag: 'clone-transformed-props',
      url: 'https://example.com/transformed-clone',
      props: {
        amount: {
          schema: z.string().transform(Number),
          outputSchema: z.number(),
          required: true,
        },
      },
      eligible: () => ({ eligible: true }),
    });
    const original = Component({ amount: '42' });

    expect(original.isEligible()).toBe(true);

    const cloned = original.clone();
    const originalInternal = getCloneInternals(original);
    const clonedInternal = getCloneInternals(cloned);

    expect(originalInternal.propsPipeline.props.amount).toBe(42);
    expect(clonedInternal.propsPipeline.props.amount).toBe(42);
    expect(clonedInternal.propsPipeline.inputProps.amount).toBe('42');
    expect(cloned.isEligible()).toBe(true);
  });

  it('should retain pending clone errors until an explicit correction', async () => {
    const target: { value: string | number } = { value: 'invalid' };
    const Component = create({
      tag: 'clone-pending-input',
      url: 'https://example.com/pending-clone',
      props: {
        target: {
          schema: z
            .object({ value: z.number() })
            .transform(({ value }) => value),
          outputSchema: z.number(),
          required: true,
        },
      },
      eligible: () => ({ eligible: true }),
    });
    const original = Component({
      target: target as { value: number },
    });
    const cloned = original.clone();

    expect(() => original.isEligible()).toThrow();
    expect(() => cloned.isEligible()).toThrow();

    target.value = 42;

    await original.updateProps({ target: target as { value: number } });
    await cloned.updateProps({ target: target as { value: number } });

    expect(original.isEligible()).toBe(true);
    expect(cloned.isEligible()).toBe(true);
    expect(getCloneInternals(original).propsPipeline.props.target).toBe(42);
    expect(getCloneInternals(cloned).propsPipeline.props.target).toBe(42);
  });

  it('should preserve the source configuration when definition options change', () => {
    const options = {
      tag: 'clone-options-snapshot',
      url: 'https://one.example.com/component',
    };
    const Component = create(options);
    const original = Component({});

    options.tag = 'mutated-clone-options';
    options.url = 'https://two.example.com/component';
    const cloned = original.clone();
    const clonedInternal = getCloneInternals(cloned);

    expect(clonedInternal.options.tag).toBe('clone-options-snapshot');
    expect(clonedInternal.resolveUrl()).toBe(
      'https://one.example.com/component'
    );
    expect(
      getSiblingInstances({
        uid: original.uid,
        tag: 'clone-options-snapshot',
      })
    ).toEqual([
      expect.objectContaining({
        uid: cloned.uid,
        tag: 'clone-options-snapshot',
      }),
    ]);
  });

  it('should participate in factory tracking, peer lookup, and close cleanup', async () => {
    const Component = create({
      tag: 'tracked-clone-component',
      url: 'https://example.com/clone',
    });
    const original = Component({});
    const cloned = original.clone();

    expect(Component.instances).toEqual([original, cloned]);
    expect(
      getSiblingInstances({
        uid: original.uid,
        tag: 'tracked-clone-component',
      })
    ).toEqual([
      {
        uid: cloned.uid,
        tag: 'tracked-clone-component',
        exports: undefined,
      },
    ]);

    await cloned.close();

    expect(Component.instances).toEqual([original]);
    expect(
      getSiblingInstances({
        uid: original.uid,
        tag: 'tracked-clone-component',
      })
    ).toEqual([]);

    await original.close();
  });

  it('should participate in destroyByTag and destroyAll', async () => {
    const TaggedComponent = create({
      tag: 'destroy-tracked-clone-by-tag',
      url: 'https://example.com/clone-by-tag',
    });
    const taggedClone = TaggedComponent({}).clone();
    const taggedCloneClose = vi.spyOn(taggedClone, 'close');

    await destroyByTag('destroy-tracked-clone-by-tag');

    expect(taggedCloneClose).toHaveBeenCalledOnce();
    expect(TaggedComponent.instances).toEqual([]);

    const GlobalComponent = create({
      tag: 'destroy-tracked-clone-globally',
      url: 'https://example.com/clone-globally',
    });
    const globalClone = GlobalComponent({}).clone();
    const globalCloneClose = vi.spyOn(globalClone, 'close');

    await destroyAll();

    expect(globalCloneClose).toHaveBeenCalledOnce();
    expect(GlobalComponent.instances).toEqual([]);
  });

  it('should keep direct ConsumerComponent clones untracked', async () => {
    const original = new ConsumerComponent({
      tag: 'direct-untracked-clone',
      url: 'https://example.com/direct-clone',
    });
    const cloned = original.clone();

    expect(
      getSiblingInstances({
        uid: original.uid,
        tag: 'direct-untracked-clone',
      })
    ).toEqual([]);

    await Promise.all([original.close(), cloned.close()]);
  });
});
