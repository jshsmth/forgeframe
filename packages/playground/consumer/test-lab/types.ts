export type ScenarioId =
  | 'lifecycle'
  | 'security'
  | 'bridge'
  | 'props'
  | 'controls'
  | 'nested'
  | 'errors'
  | 'configuration'
  | 'instances'
  | 'host-controls'
  | 'transport'
  | 'reliability'
  | 'common-actions'
  | 'redirect'
  | 'timeout-recovery'
  | 'stress'
  | 'popup'
  | 'checkout-e2e';

export interface TestResult {
  name: string;
  status: 'pass' | 'fail';
  detail: string;
}

export interface ScenarioDefinition {
  id: ScenarioId;
  title: string;
  description: string;
  autoRun?: boolean;
}
