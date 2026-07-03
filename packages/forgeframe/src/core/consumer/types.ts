import type { ComponentOptions } from '../../types/runtime';
import type { PropsDefinition } from '../../types/props';
import type { Dimensions } from '../../types/utility';
import type { ContextType } from '../../constants';

/**
 * Normalized and validated component options.
 * @internal
 */
export interface NormalizedOptions<P extends Record<string, unknown>> {
  tag: string;
  url: string | ((props: P) => string);
  props: PropsDefinition<P>;
  defaultContext: ContextType;
  dimensions: Dimensions | ((props: P) => Dimensions);
  timeout: number;
  domain?: ComponentOptions<P>['domain'];
  allowedConsumerDomains?: ComponentOptions<P>['allowedConsumerDomains'];
  containerTemplate?: ComponentOptions<P>['containerTemplate'];
  prerenderTemplate?: ComponentOptions<P>['prerenderTemplate'];
  eligible?: ComponentOptions<P>['eligible'];
  validate?: ComponentOptions<P>['validate'];
  attributes?: ComponentOptions<P>['attributes'];
  style?: ComponentOptions<P>['style'];
  autoResize?: ComponentOptions<P>['autoResize'];
  children?: ComponentOptions<P>['children'];
}
