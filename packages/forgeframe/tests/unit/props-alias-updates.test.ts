/**
 * Unit tests for alias materialization across consumer prop updates.
 *
 * Covers patch precedence, explicit clearing, validation rollback, and
 * preservation of already-materialized computed/default values.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EVENT } from '@/constants';
import { clearComponents, create, destroyAll } from '@/core/component';
import { prop } from '@/props/prop';

interface AliasProps {
  email?: string;
}

interface RequiredAliasProps {
  email: string;
}

interface MaterializedAliasProps {
  email?: string;
  computed: string;
  fallback: string;
}

type ConsumerPropsInternals = {
  propsPipeline: {
    props: Record<string, unknown>;
    inputProps: Record<string, unknown>;
  };
};

function getPropsInternals(instance: unknown): ConsumerPropsInternals {
  return instance as ConsumerPropsInternals;
}

function withUserEmail<P>(
  value: string | undefined,
  canonical?: Partial<P>
): Partial<P> {
  return {
    ...canonical,
    userEmail: value,
  } as unknown as Partial<P>;
}

describe('Consumer prop alias updates', () => {
  afterEach(async () => {
    await destroyAll();
    clearComponents();
  });

  it('should materialize aliases before merging each patch', async () => {
    const AliasComponent = create<AliasProps>({
      tag: 'alias-update-precedence-component',
      url: 'https://host.example.com/widget',
      props: {
        email: {
          schema: prop.string().optional(),
          alias: 'userEmail',
        },
      },
    });

    const instance = AliasComponent(
      withUserEmail<AliasProps>('ignored-initial-alias', {
        email: 'initial-canonical@example.com',
      })
    );
    const internal = getPropsInternals(instance);

    expect(internal.propsPipeline.props.email).toBe(
      'initial-canonical@example.com'
    );
    expect(internal.propsPipeline.inputProps).toEqual({
      email: 'initial-canonical@example.com',
    });

    await instance.updateProps(
      withUserEmail<AliasProps>('alias-update@example.com')
    );
    expect(internal.propsPipeline.props.email).toBe(
      'alias-update@example.com'
    );

    await instance.updateProps({ email: 'canonical-update@example.com' });
    expect(internal.propsPipeline.props.email).toBe(
      'canonical-update@example.com'
    );

    await instance.updateProps(
      withUserEmail<AliasProps>('ignored-update-alias', {
        email: 'same-patch-canonical@example.com',
      })
    );
    expect(internal.propsPipeline.props.email).toBe(
      'same-patch-canonical@example.com'
    );
    expect(internal.propsPipeline.inputProps).toEqual({
      email: 'same-patch-canonical@example.com',
    });
  });

  it('should clear an optional prop through its alias', async () => {
    const AliasComponent = create<AliasProps>({
      tag: 'alias-update-clear-component',
      url: 'https://host.example.com/widget',
      props: {
        email: {
          schema: prop.string().optional(),
          alias: 'userEmail',
        },
      },
    });

    const instance = AliasComponent(
      withUserEmail<AliasProps>('initial@example.com')
    );
    const internal = getPropsInternals(instance);

    await expect(
      instance.updateProps(withUserEmail<AliasProps>(undefined))
    ).resolves.toBeUndefined();

    expect(internal.propsPipeline.props.email).toBeUndefined();
    expect(internal.propsPipeline.inputProps).toEqual({ email: undefined });
  });

  it('should roll back an alias patch that fails required validation', async () => {
    const AliasComponent = create<RequiredAliasProps>({
      tag: 'alias-update-validation-component',
      url: 'https://host.example.com/widget',
      props: {
        email: {
          schema: prop.string(),
          required: true,
          alias: 'userEmail',
        },
      },
    });

    const instance = AliasComponent(
      withUserEmail<RequiredAliasProps>('initial@example.com')
    );
    const internal = getPropsInternals(instance);
    const previousProps = { ...internal.propsPipeline.props };
    const previousInputProps = { ...internal.propsPipeline.inputProps };

    await expect(
      instance.updateProps(withUserEmail<RequiredAliasProps>(undefined))
    ).rejects.toThrow('Prop "email" is required but was not provided');

    expect(internal.propsPipeline.props).toEqual(previousProps);
    expect(internal.propsPipeline.inputProps).toEqual(previousInputProps);
  });

  it('should preserve materialized values and emit canonical update keys', async () => {
    const computeValue = vi.fn(() => 'computed-once');
    const createDefault = vi.fn(() => 'default-once');
    const AliasComponent = create<MaterializedAliasProps>({
      tag: 'alias-update-materialized-component',
      url: 'https://host.example.com/widget',
      props: {
        email: {
          schema: prop.string().optional(),
          alias: 'userEmail',
        },
        computed: {
          schema: prop.string(),
          value: computeValue,
        },
        fallback: {
          schema: prop.string(),
          default: createDefault,
        },
      },
    });

    const instance = AliasComponent(
      withUserEmail<MaterializedAliasProps>('initial@example.com')
    );
    const onProps = vi.fn();
    instance.event.on(EVENT.PROPS, onProps);

    await instance.updateProps(
      withUserEmail<MaterializedAliasProps>('updated@example.com')
    );

    const internal = getPropsInternals(instance);
    expect(internal.propsPipeline.props).toMatchObject({
      email: 'updated@example.com',
      computed: 'computed-once',
      fallback: 'default-once',
    });
    expect(computeValue).toHaveBeenCalledTimes(1);
    expect(createDefault).toHaveBeenCalledTimes(1);
    expect(onProps).toHaveBeenCalledTimes(1);

    const emittedProps = onProps.mock.calls[0][0] as Record<string, unknown>;
    expect(emittedProps.email).toBe('updated@example.com');
    expect(emittedProps).not.toHaveProperty('userEmail');
  });
});
