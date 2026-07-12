import ForgeFrame, { prop } from 'forgeframe';
import type { ScenarioId, TestResult } from './types';
import {
  runCheckoutE2EScenario,
  runCommonActionsScenario,
  runConfigurationScenario,
  runHostControlsScenario,
  runInstancesScenario,
  runPopupScenario,
  runReliabilityScenario,
  runTransportScenario,
} from './extended-scenarios';

const HOST_URL = import.meta.env.VITE_HOST_URL || 'https://localhost:5174/';
const NESTED_CHILD_TAG = 'playground-browser-nested-child';
let tagCounter = 0;

const NestedChildComponent = ForgeFrame.create({
  tag: NESTED_CHILD_TAG,
  url: `${HOST_URL}?scenario=nested-child`,
  dimensions: { width: '100%', height: 240 },
  props: { scenario: prop.string().optional() },
});

export async function runScenario(
  scenario: ScenarioId,
  sandbox: HTMLElement
): Promise<TestResult[]> {
  sandbox.innerHTML = '';
  switch (scenario) {
    case 'lifecycle':
      return runLifecycleScenario(sandbox);
    case 'security':
      return runSecurityScenario(sandbox);
    case 'bridge':
      return runBridgeScenario(sandbox);
    case 'props':
      return runPropsScenario(sandbox);
    case 'controls':
      return runControlsScenario(sandbox);
    case 'nested':
      return runNestedScenario(sandbox);
    case 'errors':
      return runErrorsScenario(sandbox);
    case 'configuration':
      return runConfigurationScenario(sandbox);
    case 'instances':
      return runInstancesScenario(sandbox);
    case 'host-controls':
      return runHostControlsScenario(sandbox);
    case 'transport':
      return runTransportScenario(sandbox);
    case 'reliability':
      return runReliabilityScenario(sandbox);
    case 'common-actions':
      return runCommonActionsScenario(sandbox);
    case 'popup':
      return runPopupScenario(sandbox);
    case 'checkout-e2e':
      return runCheckoutE2EScenario(sandbox);
  }
}

async function runLifecycleScenario(sandbox: HTMLElement): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const container = createContainer(sandbox);
  const Component = ForgeFrame.create({
    tag: uniqueTag('lifecycle'),
    url: HOST_URL,
    dimensions: { width: '100%', height: 420 },
    props: { value: prop.string().optional() },
  });
  const instance = Component({ value: 'before-render' });
  let prerenderCount = 0;
  let reentrantRender: Promise<void> | undefined;
  let propUpdateError = '';

  instance.event.once('prerender', () => {
    prerenderCount += 1;
    reentrantRender = instance.render(container);
    void instance.updateProps({ value: 'during-render' }).catch((error: Error) => {
      propUpdateError = error.message;
    });
  });

  try {
    const firstRender = instance.render(container);
    await waitFor(() => reentrantRender !== undefined);
    if (!reentrantRender) throw new Error('Lifecycle callback did not re-enter render');
    await Promise.all([firstRender, reentrantRender]);
    await waitFor(() => propUpdateError);

    results.push(assertResult(
      'Lifecycle callback shares the in-flight render',
      prerenderCount === 1 && container.querySelectorAll('iframe').length === 1,
      `prerender events: ${prerenderCount}; iframes: ${container.querySelectorAll('iframe').length}`
    ));
    results.push(assertResult(
      'Props are locked during rendering',
      propUpdateError === 'Cannot update props while the component is rendering',
      propUpdateError || 'updateProps unexpectedly resolved'
    ));

    await instance.close();
    results.push(assertResult(
      'Close removes the rendered frame',
      container.querySelectorAll('iframe').length === 0,
      `iframes after close: ${container.querySelectorAll('iframe').length}`
    ));
  } catch (error) {
    results.push(failure('Lifecycle browser scenario completed', error));
    await instance.close().catch(() => undefined);
  }

  return results;
}

async function runSecurityScenario(sandbox: HTMLElement): Promise<TestResult[]> {
  const results: TestResult[] = [];

  results.push(await expectFailure(
    'Rejects non-HTTP component URLs',
    () => Promise.resolve(ForgeFrame.create({ tag: uniqueTag('protocol'), url: 'javascript:alert(1)' })),
    'Only http: and https: are supported'
  ));

  results.push(await expectFailure(
    'Rejects a URL outside the domain policy',
    () => Promise.resolve(ForgeFrame.create({
      tag: uniqueTag('domain'),
      url: HOST_URL,
      domain: 'https://blocked.example.com',
    })),
    'is not allowed by the configured domain policy'
  ));

  const reservedContainer = createContainer(sandbox);
  const ReservedComponent = ForgeFrame.create({
    tag: uniqueTag('reserved-attribute'),
    url: HOST_URL,
    attributes: { srcdoc: '<p>override</p>' },
  });
  const reservedInstance = ReservedComponent();
  results.push(await expectFailure(
    'Rejects ForgeFrame-managed iframe attributes',
    () => reservedInstance.render(reservedContainer),
    'Iframe attribute "srcdoc" is managed by ForgeFrame'
  ));
  await reservedInstance.close();

  const allowedContainer = createContainer(sandbox);
  const AllowedComponent = ForgeFrame.create({
    tag: uniqueTag('allowed-domain'),
    url: HOST_URL,
    domain: new URL(HOST_URL).origin,
    dimensions: { width: '100%', height: 420 },
  });
  const allowedInstance = AllowedComponent();
  try {
    await allowedInstance.render(allowedContainer);
    results.push(assertResult(
      'Allows a matching HTTPS host origin',
      allowedContainer.querySelectorAll('iframe').length === 1,
      `rendered ${allowedContainer.querySelectorAll('iframe').length} iframe`
    ));
  } catch (error) {
    results.push(failure('Allows a matching HTTPS host origin', error));
  } finally {
    await allowedInstance.close().catch(() => undefined);
  }

  return results;
}

interface BridgeProps extends Record<string, unknown> {
  scenario: string;
  onCalculate: (left: number, right: number) => number;
}

interface BridgeExports {
  ready: boolean;
  callbackResult: number;
  multiply: (left: number, right: number) => Promise<number>;
  exportedAt: Date;
}

async function runBridgeScenario(sandbox: HTMLElement): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const container = createContainer(sandbox);
  let callbackArgs: [number, number] | undefined;
  const Component = ForgeFrame.create<BridgeProps, BridgeExports>({
    tag: uniqueTag('bridge'),
    url: HOST_URL,
    dimensions: { width: '100%', height: 420 },
    props: {
      scenario: prop.string(),
      onCalculate: prop.function<(left: number, right: number) => number>(),
    },
  });
  const instance = Component({
    scenario: 'bridge',
    onCalculate: (left, right) => {
      callbackArgs = [left, right];
      return left + right;
    },
  });

  try {
    await instance.render(container);
    await waitFor(() => typeof instance.exports?.multiply === 'function');
    const product = await instance.exports!.multiply(6, 7);

    results.push(assertResult(
      'Host calls a consumer function and receives its result',
      callbackArgs?.[0] === 19 && callbackArgs[1] === 23 && instance.exports?.callbackResult === 42,
      `args: ${JSON.stringify(callbackArgs)}; result: ${instance.exports?.callbackResult}`
    ));
    results.push(assertResult(
      'Consumer calls a function exported by the host',
      product === 42,
      `multiply(6, 7) returned ${product}`
    ));
    results.push(assertResult(
      'Date values survive the export bridge',
      instance.exports?.exportedAt instanceof Date,
      Object.prototype.toString.call(instance.exports?.exportedAt)
    ));
  } catch (error) {
    results.push(failure('Function bridge browser scenario completed', error));
  } finally {
    await instance.close().catch(() => undefined);
  }

  return results;
}

interface PropsScenario extends Record<string, unknown> {
  scenario: string;
  publicQuery: string;
  privateQuery: string;
  sameDomainQuery: string;
  value: string;
  onObservedProps: (props: Record<string, unknown>) => void;
}

async function runPropsScenario(sandbox: HTMLElement): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const container = createContainer(sandbox);
  let observedProps: Record<string, unknown> | undefined;
  const Component = ForgeFrame.create<PropsScenario>({
    tag: uniqueTag('props'),
    url: `${HOST_URL}?existing=kept`,
    dimensions: { width: '100%', height: 420 },
    props: {
      scenario: prop.string(),
      publicQuery: { schema: prop.string(), queryParam: true },
      privateQuery: { schema: prop.string(), queryParam: true, sendToHost: false },
      sameDomainQuery: { schema: prop.string(), queryParam: true, sameDomain: true },
      value: prop.string(),
      onObservedProps: prop.function<(props: Record<string, unknown>) => void>(),
    },
  });
  const instance = Component({
    scenario: 'props',
    publicQuery: 'visible',
    privateQuery: 'hidden',
    sameDomainQuery: 'deferred',
    value: 'before',
    onObservedProps: (props) => {
      observedProps = props;
    },
  });

  try {
    await instance.render(container);
    const iframe = container.querySelector('iframe');
    const renderedUrl = new URL(iframe!.src);
    results.push(assertResult(
      'Initial query transport applies confidentiality policy',
      renderedUrl.searchParams.get('existing') === 'kept' &&
        renderedUrl.searchParams.get('publicQuery') === 'visible' &&
        !renderedUrl.searchParams.has('privateQuery') &&
        !renderedUrl.searchParams.has('sameDomainQuery'),
      renderedUrl.search
    ));

    await instance.updateProps({ value: 'after' });
    await waitFor(() => observedProps?.value === 'after');
    results.push(assertResult(
      'Post-render props synchronize to the host',
      observedProps?.value === 'after',
      `host observed value: ${String(observedProps?.value)}`
    ));
  } catch (error) {
    results.push(failure('Props browser scenario completed', error));
  } finally {
    await instance.close().catch(() => undefined);
  }

  return results;
}

async function runControlsScenario(sandbox: HTMLElement): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const container = createContainer(sandbox);
  const Component = ForgeFrame.create({
    tag: uniqueTag('controls'),
    url: HOST_URL,
    dimensions: { width: '100%', height: 420 },
  });
  const instance = Component();
  let focusEvents = 0;
  instance.event.on('focus', () => {
    focusEvents += 1;
  });

  try {
    await instance.render(container);
    const iframe = container.querySelector<HTMLIFrameElement>('iframe')!;

    await instance.resize({ width: '90%', height: 360 });
    results.push(assertResult(
      'Resize updates the rendered iframe dimensions',
      iframe.style.width === '90%' && iframe.style.height === '360px',
      `width: ${iframe.style.width}; height: ${iframe.style.height}`
    ));

    await instance.hide();
    const hidden = iframe.style.display === 'none' && iframe.style.visibility === 'hidden';
    await instance.show();
    results.push(assertResult(
      'Hide and show restore iframe visibility',
      hidden && iframe.style.display === '' && iframe.style.visibility === 'visible',
      `hidden state observed: ${hidden}; final display: ${iframe.style.display || '(default)'}`
    ));

    await instance.focus();
    results.push(assertResult(
      'Focus emits one lifecycle event',
      focusEvents === 1,
      `focus events: ${focusEvents}`
    ));

    await instance.close();
    results.push(assertResult(
      'Close cleans up the controlled iframe',
      container.querySelectorAll('iframe').length === 0,
      `iframes after close: ${container.querySelectorAll('iframe').length}`
    ));
  } catch (error) {
    results.push(failure('Consumer controls browser scenario completed', error));
    await instance.close().catch(() => undefined);
  }

  return results;
}

interface NestedParentProps extends Record<string, unknown> {
  scenario: string;
}

interface NestedParentExports {
  nestedReady: boolean;
  childTag: string;
  childExportReady: boolean;
}

async function runNestedScenario(sandbox: HTMLElement): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const container = createContainer(sandbox);
  const ParentComponent = ForgeFrame.create<NestedParentProps, NestedParentExports>({
    tag: uniqueTag('nested-parent'),
    url: HOST_URL,
    dimensions: { width: '100%', height: 620 },
    props: { scenario: prop.string() },
    children: () => ({ Child: NestedChildComponent }),
  });
  const instance = ParentComponent({ scenario: 'nested-parent' });

  try {
    await instance.render(container);
    await waitFor(() => instance.exports?.nestedReady === true, 6000);
    results.push(assertResult(
      'Host resolves the child from its local registry',
      instance.exports?.childTag === NESTED_CHILD_TAG,
      `resolved child tag: ${String(instance.exports?.childTag)}`
    ));
    results.push(assertResult(
      'Nested child renders and exports through two levels',
      instance.exports?.nestedReady === true && instance.exports.childExportReady === true,
      `nested ready: ${String(instance.exports?.nestedReady)}; child export: ${String(instance.exports?.childExportReady)}`
    ));
  } catch (error) {
    results.push(failure('Nested components browser scenario completed', error));
  } finally {
    await instance.close().catch(() => undefined);
  }

  return results;
}

interface ErrorScenarioProps extends Record<string, unknown> {
  scenario: string;
}

interface ErrorScenarioExports {
  explode: () => Promise<void>;
}

async function runErrorsScenario(sandbox: HTMLElement): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const container = createContainer(sandbox);
  const Component = ForgeFrame.create<ErrorScenarioProps, ErrorScenarioExports>({
    tag: uniqueTag('errors'),
    url: HOST_URL,
    dimensions: { width: '100%', height: 420 },
    props: { scenario: prop.string() },
  });
  const instance = Component({ scenario: 'errors' });
  let reportedError = '';
  instance.event.on('error', (error: Error) => {
    reportedError = error.message;
  });

  try {
    await instance.render(container);
    await waitFor(() => reportedError);
    await waitFor(() => typeof instance.exports?.explode === 'function');
    results.push(assertResult(
      'Host-reported errors reach the consumer',
      reportedError === 'Expected host-reported error',
      reportedError
    ));

    let remoteError: Error | undefined;
    try {
      await instance.exports!.explode();
    } catch (error) {
      remoteError = error instanceof Error ? error : new Error(String(error));
    }
    results.push(assertResult(
      'Thrown host functions reject with the original message',
      remoteError?.message === 'Expected host function failure',
      remoteError?.message ?? 'remote function unexpectedly resolved'
    ));
    results.push(assertResult(
      'Remote stack locations are not exposed',
      Boolean(remoteError?.stack) &&
        !remoteError!.stack!.includes('host/main.ts') &&
        !remoteError!.stack!.includes('exportInitialData'),
      remoteError?.stack?.split('\n').slice(0, 2).join(' | ') ?? 'no local stack available'
    ));
  } catch (error) {
    results.push(failure('Error transport browser scenario completed', error));
  } finally {
    await instance.close().catch(() => undefined);
  }

  return results;
}

function createContainer(parent: HTMLElement): HTMLDivElement {
  const container = document.createElement('div');
  container.style.marginBottom = '12px';
  parent.appendChild(container);
  return container;
}

function uniqueTag(scope: string): string {
  tagCounter += 1;
  return `test-${scope}-${Date.now()}-${tagCounter}`;
}

function assertResult(name: string, passed: boolean, detail: string): TestResult {
  return { name, status: passed ? 'pass' : 'fail', detail };
}

function failure(name: string, error: unknown): TestResult {
  return {
    name,
    status: 'fail',
    detail: error instanceof Error ? error.message : String(error),
  };
}

async function expectFailure(
  name: string,
  action: () => Promise<unknown>,
  expectedMessage: string
): Promise<TestResult> {
  try {
    await action();
    return assertResult(name, false, 'operation unexpectedly succeeded');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return assertResult(name, message.includes(expectedMessage), message);
  }
}

async function waitFor<T>(read: () => T, timeoutMs = 4000): Promise<T> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = read();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out after ${timeoutMs}ms`);
}
