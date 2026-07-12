import ForgeFrame, { prop } from 'forgeframe';
import type { TestResult } from './types';

const HOST_URL = import.meta.env.VITE_HOST_URL || 'https://localhost:5174/';
const HOST_ORIGIN = new URL(HOST_URL).origin;
let tagCounter = 0;

interface ConfigurationProps extends Record<string, unknown> {
  scenario: string;
  variant: string;
  label: string;
  tier: string;
  enabled: boolean;
  count: number;
}

interface ConfigurationExports {
  observed: Record<string, unknown>;
}

export async function runConfigurationScenario(
  sandbox: HTMLElement
): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const container = createContainer(sandbox);
  const foreignFrame = document.createElement('iframe');
  foreignFrame.src = 'about:blank';
  sandbox.appendChild(foreignFrame);
  await waitFor(() => foreignFrame.contentWindow);

  let containerTemplateCalls = 0;
  let prerenderTemplateCalls = 0;
  const Component = ForgeFrame.create<ConfigurationProps, ConfigurationExports>({
    tag: uniqueTag('configuration'),
    url: (props) => `${HOST_URL}?scenario=configuration&variant=${encodeURIComponent(props.variant)}`,
    dimensions: (props) => ({ width: props.variant === 'wide' ? 480 : 320, height: 320 }),
    domain: HOST_ORIGIN,
    props: {
      scenario: prop.string(),
      variant: prop.string(),
      label: prop.string().trim(),
      tier: prop.string().default('standard'),
      enabled: prop.boolean(),
      count: prop.number().int(),
    },
    eligible: ({ props }) => ({
      eligible: props.enabled,
      reason: props.enabled ? undefined : 'Feature disabled',
    }),
    validate: ({ props }) => {
      if (props.count < 1) throw new Error('Count must be positive');
    },
    attributes: (props) => ({
      title: `${props.label} component`,
      'data-browser-suite': 'configuration',
    }),
    style: () => ({ border: '3px solid rgb(233, 69, 96)', borderRadius: '12px' }),
    prerenderTemplate: ({ doc }) => {
      prerenderTemplateCalls += 1;
      const element = doc.createElement('div');
      element.dataset.testPrerender = 'configuration';
      element.textContent = 'Loading configuration scenario';
      return element;
    },
    containerTemplate: ({ doc }) => {
      containerTemplateCalls += 1;
      const element = doc.createElement('section');
      element.dataset.testContainer = 'configuration';
      return element;
    },
  });
  const instance = Component({
    scenario: 'configuration',
    variant: 'wide',
    label: '  configured  ',
    tier: undefined as unknown as string,
    enabled: true,
    count: 2,
  });

  try {
    const currentWindowSupported = await Component.canRenderTo(window);
    const foreignWindowSupported = await Component.canRenderTo(foreignFrame.contentWindow!);
    results.push(assertResult(
      'Render-target capability is explicit',
      currentWindowSupported && !foreignWindowSupported,
      `current: ${currentWindowSupported}; foreign: ${foreignWindowSupported}`
    ));

    await instance.renderTo(window, container);
    await waitFor(() => instance.exports?.observed);
    const iframe = container.querySelector<HTMLIFrameElement>('iframe')!;
    const renderedUrl = new URL(iframe.src);

    results.push(assertResult(
      'Dynamic URL and dimensions resolve from normalized props',
      renderedUrl.searchParams.get('variant') === 'wide' &&
        iframe.style.width === '480px' && iframe.style.height === '320px',
      `${renderedUrl.search}; ${iframe.style.width} × ${iframe.style.height}`
    ));
    results.push(assertResult(
      'Schema transforms and defaults reach the host',
      instance.exports?.observed.label === 'configured' &&
        instance.exports.observed.tier === 'standard',
      `label: ${String(instance.exports?.observed.label)}; tier: ${String(instance.exports?.observed.tier)}`
    ));
    results.push(assertResult(
      'Dynamic iframe attributes and styles are applied',
      iframe.title === 'configured component' &&
        iframe.dataset.browserSuite === 'configuration' &&
        iframe.style.borderRadius === '12px',
      `title: ${iframe.title}; marker: ${String(iframe.dataset.browserSuite)}; radius: ${iframe.style.borderRadius}`
    ));
    results.push(assertResult(
      'Custom container and prerender templates complete their lifecycle',
      containerTemplateCalls === 1 && prerenderTemplateCalls === 1 &&
        Boolean(container.querySelector('[data-test-container="configuration"]')) &&
        !container.querySelector('[data-test-prerender="configuration"]'),
      `container calls: ${containerTemplateCalls}; prerender calls: ${prerenderTemplateCalls}`
    ));

    const crossWindowInstance = Component({
      scenario: 'configuration', variant: 'wide', label: 'foreign',
      tier: 'standard', enabled: true, count: 1,
    });
    results.push(await expectFailure(
      'Cross-window renderTo fails explicitly',
      () => crossWindowInstance.renderTo(foreignFrame.contentWindow!, container),
      'Cross-window renderTo is not supported'
    ));
    await crossWindowInstance.close();

    const ineligible = Component({
      scenario: 'configuration', variant: 'wide', label: 'disabled',
      tier: 'standard', enabled: false, count: 1,
    });
    results.push(assertResult(
      'Eligibility can be queried before rendering',
      ineligible.isEligible() === false,
      `isEligible: ${ineligible.isEligible()}`
    ));
    results.push(await expectFailure(
      'Ineligible components fail before opening a host',
      () => ineligible.render(createContainer(sandbox)),
      'Component not eligible: Feature disabled'
    ));
    await ineligible.close();

    const invalid = Component({
      scenario: 'configuration', variant: 'wide', label: 'invalid',
      tier: 'standard', enabled: true, count: 0,
    });
    results.push(await expectFailure(
      'Component-level validation blocks invalid configuration',
      () => invalid.render(createContainer(sandbox)),
      'Count must be positive'
    ));
    await invalid.close();
  } catch (error) {
    results.push(failure('Configuration browser scenario completed', error));
  } finally {
    await instance.close().catch(() => undefined);
    foreignFrame.remove();
  }

  return results;
}

interface InstanceProps extends Record<string, unknown> {
  scenario: string;
  label: string;
}

interface InstanceExports {
  instanceLabel: string;
  peerUids: string[];
  peerCount: number;
}

export async function runInstancesScenario(sandbox: HTMLElement): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const tag = uniqueTag('instances');
  const Component = ForgeFrame.create<InstanceProps, InstanceExports>({
    tag,
    url: `${HOST_URL}?scenario=instances`,
    dimensions: { width: '100%', height: 300 },
    props: {
      scenario: prop.string(),
      label: prop.string(),
    },
  });
  const originalContainer = createContainer(sandbox);
  const cloneContainer = createContainer(sandbox);
  const original = Component({ scenario: 'instances', label: 'original-snapshot' });
  const clone = original.clone();

  try {
    await original.updateProps({ label: 'updated-original' });
    results.push(assertResult(
      'Clone is distinct and tracked by its factory',
      original.uid !== clone.uid && Component.instances.length === 2,
      `uids differ: ${original.uid !== clone.uid}; tracked: ${Component.instances.length}`
    ));

    await Promise.all([original.render(originalContainer), clone.render(cloneContainer)]);
    await waitFor(() => original.exports?.instanceLabel && clone.exports?.instanceLabel);
    results.push(assertResult(
      'Clone preserves its creation-time prop snapshot',
      original.exports?.instanceLabel === 'updated-original' &&
        clone.exports?.instanceLabel === 'original-snapshot',
      `original: ${String(original.exports?.instanceLabel)}; clone: ${String(clone.exports?.instanceLabel)}`
    ));
    results.push(assertResult(
      'Same-tag hosts discover one another as peers',
      original.exports?.peerCount === 1 && clone.exports?.peerCount === 1 &&
        original.exports.peerUids.includes(clone.uid) &&
        clone.exports.peerUids.includes(original.uid),
      `original peers: ${JSON.stringify(original.exports?.peerUids)}; clone peers: ${JSON.stringify(clone.exports?.peerUids)}`
    ));

    await ForgeFrame.destroyByTag(tag);
    results.push(assertResult(
      'destroyByTag removes every live frame and tracked instance',
      Component.instances.length === 0 && sandbox.querySelectorAll('iframe').length === 0,
      `tracked: ${Component.instances.length}; frames: ${sandbox.querySelectorAll('iframe').length}`
    ));
    await ForgeFrame.destroyByTag(tag);
    results.push(assertResult(
      'Bulk destruction is idempotent',
      Component.instances.length === 0,
      `tracked after second destroy: ${Component.instances.length}`
    ));
  } catch (error) {
    results.push(failure('Instances browser scenario completed', error));
    await Promise.all([original.close().catch(() => undefined), clone.close().catch(() => undefined)]);
  }

  return results;
}

interface HostControlProps extends Record<string, unknown> {
  scenario: string;
  onResize: (dimensions: { width?: string | number; height?: string | number }) => void;
  onFocus: () => void;
  onClose: () => void;
  onDestroy: () => void;
}

interface HostControlExports {
  runControls: () => Promise<{ consumerDomain: string; parentMatched: boolean }>;
  requestClose: () => Promise<boolean>;
}

export async function runHostControlsScenario(sandbox: HTMLElement): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const container = createContainer(sandbox);
  let resizeCallbacks = 0;
  let focusCallbacks = 0;
  let closeCallbacks = 0;
  let destroyCallbacks = 0;
  let resizeEvents = 0;
  let focusEvents = 0;
  let closeEvents = 0;
  const Component = ForgeFrame.create<HostControlProps, HostControlExports>({
    tag: uniqueTag('host-controls'),
    url: `${HOST_URL}?scenario=host-controls`,
    dimensions: { width: '100%', height: 320 },
    props: { scenario: prop.string() },
  });
  const instance = Component({
    scenario: 'host-controls',
    onResize: () => { resizeCallbacks += 1; },
    onFocus: () => { focusCallbacks += 1; },
    onClose: () => { closeCallbacks += 1; },
    onDestroy: () => { destroyCallbacks += 1; },
  });
  instance.event.on('resize', () => { resizeEvents += 1; });
  instance.event.on('focus', () => { focusEvents += 1; });
  instance.event.on('close', () => { closeEvents += 1; });

  try {
    await instance.render(container);
    await waitFor(() => instance.exports?.runControls);
    const iframe = container.querySelector<HTMLIFrameElement>('iframe')!;
    const controlsPromise = instance.exports!.runControls();
    await waitFor(() => iframe.style.display === 'none');
    const wasHidden = iframe.style.visibility === 'hidden';
    const controlResult = await controlsPromise;

    results.push(assertResult(
      'Host resize crosses the control bridge',
      iframe.style.width === '460px' && iframe.style.height === '350px' &&
        resizeEvents === 1 && resizeCallbacks === 1,
      `${iframe.style.width} × ${iframe.style.height}; events: ${resizeEvents}; callbacks: ${resizeCallbacks}`
    ));
    results.push(assertResult(
      'Host focus reaches lifecycle events and callbacks',
      focusEvents === 1 && focusCallbacks === 1,
      `events: ${focusEvents}; callbacks: ${focusCallbacks}`
    ));
    results.push(assertResult(
      'Host hide and show visibly round-trip',
      wasHidden && iframe.style.display === '' && iframe.style.visibility === 'visible',
      `hidden observed: ${wasHidden}; final display: ${iframe.style.display || '(default)'}`
    ));
    results.push(assertResult(
      'Host sees the verified consumer window and origin',
      controlResult.parentMatched && controlResult.consumerDomain === window.location.origin,
      `parent matched: ${controlResult.parentMatched}; origin: ${controlResult.consumerDomain}`
    ));

    await instance.exports!.requestClose();
    await waitFor(() => container.querySelectorAll('iframe').length === 0);
    results.push(assertResult(
      'Host-requested close runs consumer teardown once',
      closeEvents === 1 && closeCallbacks === 1 && destroyCallbacks === 1,
      `events: ${closeEvents}; close callbacks: ${closeCallbacks}; destroy callbacks: ${destroyCallbacks}`
    ));
  } catch (error) {
    results.push(failure('Host controls browser scenario completed', error));
    await instance.close().catch(() => undefined);
  }

  return results;
}

interface TransportProps extends Record<string, unknown> {
  scenario: string;
  bodySecret: string;
  trustedValue: string;
  blockedValue: string;
  privateValue: string;
}

interface TransportExports {
  observed: Record<string, unknown>;
}

export async function runTransportScenario(sandbox: HTMLElement): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const container = createContainer(sandbox);
  const Component = ForgeFrame.create<TransportProps, TransportExports>({
    tag: uniqueTag('transport'),
    url: `${HOST_URL}?scenario=transport`,
    dimensions: { width: '100%', height: 320 },
    props: {
      scenario: prop.string(),
      bodySecret: { schema: prop.string(), bodyParam: 'payload' },
      trustedValue: { schema: prop.string(), trustedDomains: [HOST_ORIGIN] },
      blockedValue: { schema: prop.string(), trustedDomains: ['https://blocked.example.com'] },
      privateValue: { schema: prop.string(), sendToHost: false },
    },
  });
  const instance = Component({
    scenario: 'transport',
    bodySecret: 'posted-not-queried',
    trustedValue: 'trusted-host-value',
    blockedValue: 'must-not-cross',
    privateValue: 'consumer-only',
  });

  try {
    await instance.render(container);
    await waitFor(() => instance.exports?.observed);
    const iframe = container.querySelector<HTMLIFrameElement>('iframe')!;
    results.push(assertResult(
      'POST body props do not leak into the URL',
      !iframe.src.includes('payload=') && !iframe.src.includes('posted-not-queried'),
      iframe.src || '(form-target navigation has no src attribute)'
    ));
    results.push(assertResult(
      'POST body bootstrap still delivers the prop to the host',
      instance.exports?.observed.bodySecret === 'posted-not-queried',
      `host observed: ${String(instance.exports?.observed.bodySecret)}`
    ));
    results.push(assertResult(
      'Trusted-domain props reach an allowed host',
      instance.exports?.observed.trustedValue === 'trusted-host-value',
      `host observed: ${String(instance.exports?.observed.trustedValue)}`
    ));
    results.push(assertResult(
      'Blocked and consumer-only props never reach the host',
      !('blockedValue' in instance.exports!.observed) &&
        !('privateValue' in instance.exports!.observed),
      `host keys: ${Object.keys(instance.exports!.observed).join(', ')}`
    ));
  } catch (error) {
    results.push(failure('POST and trust-policy browser scenario completed', error));
  } finally {
    await instance.close().catch(() => undefined);
  }

  return results;
}

interface PopupProps extends Record<string, unknown> {
  scenario: string;
}

interface PopupExports {
  popupReady: boolean;
  hasOpener: boolean;
  consumerDomain: string;
}

export async function runPopupScenario(sandbox: HTMLElement): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const container = createContainer(sandbox);
  let focusEvents = 0;
  let resizeEvents = 0;
  let closeEvents = 0;
  const Component = ForgeFrame.create<PopupProps, PopupExports>({
    tag: uniqueTag('popup'),
    url: `${HOST_URL}?scenario=popup`,
    defaultContext: ForgeFrame.CONTEXT.POPUP,
    dimensions: { width: 520, height: 420 },
    props: { scenario: prop.string() },
  });
  const instance = Component({ scenario: 'popup' });
  instance.event.on('focus', () => { focusEvents += 1; });
  instance.event.on('resize', () => { resizeEvents += 1; });
  instance.event.on('close', () => { closeEvents += 1; });

  try {
    await instance.render(container);
    await waitFor(() => instance.exports?.popupReady, 6000);
    results.push(assertResult(
      'Popup opens without creating an iframe',
      container.querySelectorAll('iframe').length === 0,
      `iframes: ${container.querySelectorAll('iframe').length}`
    ));
    results.push(assertResult(
      'Popup completes the cross-window handshake',
      instance.exports?.popupReady === true && instance.exports.hasOpener,
      `ready: ${String(instance.exports?.popupReady)}; opener: ${String(instance.exports?.hasOpener)}`
    ));
    results.push(assertResult(
      'Popup verifies its consumer origin',
      instance.exports?.consumerDomain === window.location.origin,
      `consumer origin: ${String(instance.exports?.consumerDomain)}`
    ));

    await instance.focus();
    await instance.resize({ width: 540, height: 440 });
    results.push(assertResult(
      'Popup focus and resize controls remain operational',
      focusEvents === 1 && resizeEvents === 1,
      `focus events: ${focusEvents}; resize events: ${resizeEvents}`
    ));
    await instance.close();
    results.push(assertResult(
      'Popup closes through normal lifecycle cleanup',
      closeEvents === 1,
      `close events: ${closeEvents}`
    ));
  } catch (error) {
    results.push(failure('Popup end-to-end scenario completed', error));
    await instance.close().catch(() => undefined);
  }

  return results;
}

interface CheckoutReceipt {
  transactionId: string;
  amount: number;
}

interface CheckoutProps extends Record<string, unknown> {
  scenario: string;
  sessionId: string;
  amount: number;
  status: string;
  onApproved: (receipt: CheckoutReceipt) => void;
}

interface CheckoutExports {
  checkoutReady: boolean;
  submitPayment: (token: string) => Promise<CheckoutReceipt & {
    status: string;
    tokenAccepted: boolean;
    sessionId: string;
  }>;
}

export async function runCheckoutE2EScenario(sandbox: HTMLElement): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const container = createContainer(sandbox);
  const lifecycle: string[] = [];
  let approvedReceipt: CheckoutReceipt | undefined;
  const Component = ForgeFrame.create<CheckoutProps, CheckoutExports>({
    tag: uniqueTag('checkout'),
    url: `${HOST_URL}?scenario=checkout-e2e`,
    dimensions: { width: '100%', height: 420 },
    props: {
      scenario: prop.string(),
      sessionId: prop.string().nonempty(),
      amount: prop.number().min(1),
      status: prop.string(),
      onApproved: prop.function<(receipt: CheckoutReceipt) => void>(),
    },
  });
  const instance = Component({
    scenario: 'checkout-e2e',
    sessionId: 'session-browser-e2e',
    amount: 49.95,
    status: 'created',
    onApproved: (receipt) => { approvedReceipt = receipt; },
  });
  for (const event of ['prerender', 'render', 'rendered', 'display']) {
    instance.event.on(event as 'prerender', () => { lifecycle.push(event); });
  }

  try {
    await instance.render(container);
    await waitFor(() => instance.exports?.checkoutReady);
    results.push(assertResult(
      'Checkout renders and reaches ready state',
      container.querySelectorAll('iframe').length === 1 && instance.exports?.checkoutReady === true,
      `frames: ${container.querySelectorAll('iframe').length}; ready: ${String(instance.exports?.checkoutReady)}`
    ));
    results.push(assertResult(
      'Customer journey emits lifecycle events in order',
      lifecycle.join(',') === 'prerender,render,rendered,display',
      lifecycle.join(' → ')
    ));

    await instance.updateProps({ status: 'confirming' });
    const receipt = await instance.exports!.submitPayment('tok_browser_success');
    results.push(assertResult(
      'Updated checkout state is observed by the host action',
      receipt.status === 'confirming',
      `host status during submit: ${receipt.status}`
    ));
    results.push(assertResult(
      'Host submission calls the consumer approval callback',
      approvedReceipt?.transactionId === 'txn-browser-e2e' && approvedReceipt.amount === 49.95,
      `consumer receipt: ${JSON.stringify(approvedReceipt)}`
    ));
    results.push(assertResult(
      'Remote submit returns the complete receipt',
      receipt.transactionId === 'txn-browser-e2e' && receipt.amount === 49.95 &&
        receipt.tokenAccepted && receipt.sessionId === 'session-browser-e2e',
      JSON.stringify(receipt)
    ));

    await instance.close();
    results.push(assertResult(
      'Completed checkout leaves no embedded frame behind',
      container.querySelectorAll('iframe').length === 0,
      `frames after completion: ${container.querySelectorAll('iframe').length}`
    ));
  } catch (error) {
    results.push(failure('Customer checkout end-to-end scenario completed', error));
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
