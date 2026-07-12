/**
 * @packageDocumentation
 * Host props state and reconciliation helpers.
 *
 * @remarks
 * This internal module owns `hostProps` construction, reserved key filtering,
 * bootstrap validation, live prop reconciliation, nested child creation, and
 * `window.hostProps` exposure behavior.
 */

import { EVENT } from '../../constants';
import { deserializeProps } from '../../props/serialize';
import { isStandardSchema, validateProps } from '../../props';
import { EMPTY_PROP_DEFINITIONS } from '../../props/definitions';
import { getDomain } from '../../window/helpers';
import { getRegisteredComponent } from '../component-registry';
import { HOST_PROPS_BUILTIN_KEYS } from './builtin-keys';
import type { SerializedProps } from '../../props/types';
import type { ForgeFrameComponent, HostProps } from '../../types/runtime';
import type { PropDefinition, PropsDefinition } from '../../types/props';
import type { HostComponentRef, WindowNamePayload } from '../../window/types';
import type {
  HostPropsRuntimeOptions,
  WindowWithHostProps,
} from './types';

function filterReservedHostPropKeys<P extends Record<string, unknown>>(props: P): P {
  const filteredProps: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(props)) {
    if (HOST_PROPS_BUILTIN_KEYS.has(key)) {
      continue;
    }

    filteredProps[key] = value;
  }

  return filteredProps as P;
}

export class HostPropsRuntime<P extends Record<string, unknown>> {
  public hostProps!: HostProps<P>;

  public consumerProps!: P;

  public propsHandlers: Set<(props: P) => void> = new Set();

  constructor(
    private propDefinitions: PropsDefinition<P> = EMPTY_PROP_DEFINITIONS as PropsDefinition<P>,
    private options: HostPropsRuntimeOptions
  ) {}

  initializeHostProps(payload: WindowNamePayload<P>): HostProps<P> {
    const deserializedProps = this.deserialize(payload.props);

    validateProps(deserializedProps, this.getBootstrapValidationDefinitions());
    this.consumerProps = deserializedProps;

    const hostConsumerProps = filterReservedHostPropKeys(deserializedProps);

    this.hostProps = {
      ...hostConsumerProps,
      uid: this.options.uid,
      tag: this.options.tag,
      close: () => this.options.controls.close(),
      focus: () => this.options.controls.focus(),
      resize: (dimensions) => this.options.controls.resize(dimensions),
      show: () => this.options.controls.show(),
      hide: () => this.options.controls.hide(),
      onProps: (handler: (props: P) => void) => this.onProps(handler),
      onError: (error: Error) => this.options.controls.onError(error),
      getConsumer: () => this.options.getConsumerWindow(),
      getConsumerDomain: () => this.options.getConsumerDomain(),
      export: <T>(exports: T) => this.options.controls.exportData(exports),
      consumer: {
        props: this.consumerProps,
        export: <T>(data: T) => this.options.controls.consumerExport(data),
      },
      getPeerInstances: (options) => this.options.controls.getPeerInstances(options),
      children: this.buildNestedComponents(payload.children),
    };

    return this.hostProps;
  }

  exposeHostProps(): void {
    const hostWindow = window as unknown as WindowWithHostProps<P>;

    try {
      Object.defineProperty(hostWindow, 'hostProps', {
        configurable: true,
        enumerable: true,
        get: () => {
          this.options.onFirstHostPropsAccess();
          return this.hostProps;
        },
        set: (value: HostProps<P> | undefined) => {
          if (value) {
            this.hostProps = value;
          }
        },
      });
    } catch {
      hostWindow.hostProps = this.hostProps;
    }
  }

  applyHostConfiguration(propDefinitions: PropsDefinition<P>): void {
    this.propDefinitions = propDefinitions;
    validateProps(this.consumerProps, this.getBootstrapValidationDefinitions());
    Object.assign(this.hostProps, filterReservedHostPropKeys(this.consumerProps));
    this.hostProps.consumer.props = this.consumerProps;
  }

  applySerializedProps(serializedProps: SerializedProps): { success: true } {
    try {
      const previousProps = this.consumerProps;
      const nextProps = this.deserialize(serializedProps);

      validateProps(nextProps, this.propDefinitions);
      const nextHostProps = filterReservedHostPropKeys(nextProps);

      this.removeStaleHostProps(previousProps, nextHostProps);
      this.consumerProps = nextProps;
      Object.assign(this.hostProps, nextHostProps);
      this.hostProps.consumer.props = this.consumerProps;

      for (const handler of this.propsHandlers) {
        try {
          handler(nextProps);
        } catch (error) {
          console.error('Error in props handler:', error);
        }
      }

      this.options.event.emit(EVENT.PROPS, nextProps);

      return { success: true };
    } catch (error) {
      const propsError = error instanceof Error ? error : new Error(String(error));
      console.error('Error deserializing props:', propsError);
      this.options.event.emit(EVENT.ERROR, propsError);
      throw propsError;
    }
  }

  destroy(): void {
    this.propsHandlers.clear();
  }

  private onProps(handler: (props: P) => void): { cancel: () => void } {
    this.propsHandlers.add(handler);

    return {
      cancel: () => this.propsHandlers.delete(handler),
    };
  }

  private deserialize(serializedProps: SerializedProps): P {
    return deserializeProps(
      serializedProps,
      this.propDefinitions,
      this.options.getMessenger(),
      this.options.getBridge(),
      this.options.getConsumerWindow(),
      this.options.getConsumerDomain()
    );
  }

  private getBootstrapValidationDefinitions(): PropsDefinition<P> {
    if (
      !this.options.isConsumerDomainVerified() ||
      this.options.getConsumerDomain() !== getDomain()
    ) {
      return this.propDefinitions;
    }

    let hasDeferredSameDomainProp = false;
    const bootstrapDefinitions = {
      ...this.propDefinitions,
    } as PropsDefinition<P>;

    for (const [key, definition] of Object.entries(this.propDefinitions)) {
      if (!definition || isStandardSchema(definition) || !definition.sameDomain) {
        continue;
      }

      hasDeferredSameDomainProp = true;
      bootstrapDefinitions[key as keyof P] = {
        ...(definition as PropDefinition<unknown, P>),
        required: false,
      } as PropsDefinition<P>[keyof P];
    }

    return hasDeferredSameDomainProp ? bootstrapDefinitions : this.propDefinitions;
  }

  private buildNestedComponents(
    nestedRefs?: Record<string, HostComponentRef>
  ): Record<string, ForgeFrameComponent> | undefined {
    if (!nestedRefs) {
      return undefined;
    }

    const components: Record<string, ForgeFrameComponent> = {};

    for (const [name, ref] of Object.entries(nestedRefs)) {
      const component = getRegisteredComponent(ref.tag);
      if (component) {
        components[name] = component;
      } else {
        console.warn(
          `Nested component "${name}" (${ref.tag}) must be registered in the host bundle before hostProps is initialized`
        );
      }
    }

    return Object.keys(components).length > 0 ? components : undefined;
  }

  private removeStaleHostProps(
    previousProps: P,
    nextHostProps: Record<string, unknown>
  ): void {
    for (const key of Object.keys(previousProps)) {
      if (HOST_PROPS_BUILTIN_KEYS.has(key) || key in nextHostProps) {
        continue;
      }

      delete (this.hostProps as Record<string, unknown>)[key];
    }
  }
}
