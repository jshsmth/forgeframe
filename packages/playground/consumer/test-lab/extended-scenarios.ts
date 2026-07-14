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

interface TrustPolicyProps extends Record<string, unknown> {
  scenario: string;
  trustedValue: string;
  blockedValue: string;
  privateValue: string;
}

interface PostTransportProps extends Record<string, unknown> {
  scenario: string;
  bodySecret: string;
}

interface TransportExports {
  observed: Record<string, unknown>;
}

export async function runTransportScenario(sandbox: HTMLElement): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const trustContainer = createContainer(sandbox);
  const TrustComponent = ForgeFrame.create<TrustPolicyProps, TransportExports>({
    tag: uniqueTag('trust-policy'),
    url: `${HOST_URL}?scenario=transport`,
    dimensions: { width: '100%', height: 320 },
    props: {
      scenario: prop.string(),
      trustedValue: { schema: prop.string(), trustedDomains: [HOST_ORIGIN] },
      blockedValue: { schema: prop.string(), trustedDomains: ['https://blocked.example.com'] },
      privateValue: { schema: prop.string(), sendToHost: false },
    },
  });
  const trustInstance = TrustComponent({
    scenario: 'transport',
    trustedValue: 'trusted-host-value',
    blockedValue: 'must-not-cross',
    privateValue: 'consumer-only',
  });

  try {
    await trustInstance.render(trustContainer);
    await waitFor(() => trustInstance.exports?.observed);
    results.push(assertResult(
      'Trusted-domain props reach an allowed host',
      trustInstance.exports?.observed.trustedValue === 'trusted-host-value',
      `host observed: ${String(trustInstance.exports?.observed.trustedValue)}`
    ));
    results.push(assertResult(
      'Blocked and consumer-only props never reach the host',
      !('blockedValue' in trustInstance.exports!.observed) &&
        !('privateValue' in trustInstance.exports!.observed),
      `host keys: ${Object.keys(trustInstance.exports!.observed).join(', ')}`
    ));
  } catch (error) {
    results.push(failure('Trust-policy browser journey completed', error));
  } finally {
    await trustInstance.close().catch(() => undefined);
  }

  if (!import.meta.env.DEV) {
    results.push(skipResult(
      'POST body bootstrap requires a POST-capable host',
      'Skipped in production because the deployed static host returns HTTP 405 for POST; covered by local browser and integration tests.'
    ));
    return results;
  }

  const postContainer = createContainer(sandbox);
  const PostComponent = ForgeFrame.create<PostTransportProps, TransportExports>({
    tag: uniqueTag('post-transport'),
    url: `${HOST_URL}?scenario=transport`,
    dimensions: { width: '100%', height: 320 },
    props: {
      scenario: prop.string(),
      bodySecret: { schema: prop.string(), bodyParam: 'payload' },
    },
  });
  const postInstance = PostComponent({
    scenario: 'transport',
    bodySecret: 'posted-not-queried',
  });

  try {
    await postInstance.render(postContainer);
    await waitFor(() => postInstance.exports?.observed);
    const iframe = postContainer.querySelector<HTMLIFrameElement>('iframe')!;
    results.push(assertResult(
      'POST body props do not leak into the URL',
      !iframe.src.includes('payload=') && !iframe.src.includes('posted-not-queried'),
      iframe.src || '(form-target navigation has no src attribute)'
    ));
    results.push(assertResult(
      'POST body bootstrap still delivers the prop to the host',
      postInstance.exports?.observed.bodySecret === 'posted-not-queried',
      `host observed: ${String(postInstance.exports?.observed.bodySecret)}`
    ));
  } catch (error) {
    results.push(failure('POST body-param browser journey completed', error));
  } finally {
    await postInstance.close().catch(() => undefined);
  }

  return results;
}

interface ReliabilityProps extends Record<string, unknown> {
  scenario: string;
  label: string;
}

interface ReliabilityExports {
  ready: boolean;
  readState: () => Promise<{ label: string; uid: string }>;
}

export async function runReliabilityScenario(
  sandbox: HTMLElement
): Promise<TestResult[]> {
  const results: TestResult[] = [];
  let countRenderUrlCalls = false;
  let renderUrlCalls = 0;
  const Component = ForgeFrame.create<ReliabilityProps, ReliabilityExports>({
    tag: uniqueTag('reliability'),
    url: () => {
      if (!countRenderUrlCalls) {
        return `${HOST_URL}?scenario=reliability`;
      }
      renderUrlCalls += 1;
      const snapshot = renderUrlCalls === 1 ? 'first' : 'unexpected-repeat';
      return `${HOST_URL}?scenario=reliability&snapshot=${snapshot}`;
    },
    domain: HOST_ORIGIN,
    dimensions: { width: '100%', height: 300 },
    props: {
      scenario: prop.string(),
      label: prop.string(),
    },
  });

  const firstContainer = createContainer(sandbox);
  const first = Component({ scenario: 'reliability', label: 'first-generation' });

  try {
    countRenderUrlCalls = true;
    renderUrlCalls = 0;
    await first.render(firstContainer);
    countRenderUrlCalls = false;
    await waitFor(() => first.exports?.ready);
    const firstFrame = firstContainer.querySelector<HTMLIFrameElement>('iframe')!;

    results.push(assertResult(
      'A dynamic URL is resolved once for the complete browser render',
      renderUrlCalls === 1 && new URL(firstFrame.src).searchParams.get('snapshot') === 'first',
      `resolver calls: ${renderUrlCalls}; url: ${firstFrame.src}`
    ));

    await first.updateProps({ label: 'first-updated' });
    const updatedFirstState = await first.exports!.readState();
    results.push(assertResult(
      'A live host export observes the latest prop state',
      updatedFirstState.label === 'first-updated' && updatedFirstState.uid === first.uid,
      JSON.stringify(updatedFirstState)
    ));

    await first.close();
    results.push(assertResult(
      'A completed generation releases its frame and factory tracking',
      firstContainer.querySelectorAll('iframe').length === 0 && Component.instances.length === 0,
      `frames: ${firstContainer.querySelectorAll('iframe').length}; tracked: ${Component.instances.length}`
    ));

    const alphaContainer = createContainer(sandbox);
    const betaContainer = createContainer(sandbox);
    const alpha = Component({ scenario: 'reliability', label: 'alpha' });
    const beta = Component({ scenario: 'reliability', label: 'beta' });

    try {
      await Promise.all([alpha.render(alphaContainer), beta.render(betaContainer)]);
      await waitFor(() => alpha.exports?.ready && beta.exports?.ready);
      const [alphaInitial, betaInitial] = await Promise.all([
        alpha.exports!.readState(),
        beta.exports!.readState(),
      ]);
      results.push(assertResult(
        'Concurrent instances keep independent channels and initial state',
        alphaInitial.label === 'alpha' && betaInitial.label === 'beta' &&
          alphaInitial.uid === alpha.uid && betaInitial.uid === beta.uid,
        `alpha: ${JSON.stringify(alphaInitial)}; beta: ${JSON.stringify(betaInitial)}`
      ));

      await Promise.all([
        alpha.updateProps({ label: 'alpha-updated' }),
        beta.updateProps({ label: 'beta-updated' }),
      ]);
      const [alphaUpdated, betaUpdated] = await Promise.all([
        alpha.exports!.readState(),
        beta.exports!.readState(),
      ]);
      results.push(assertResult(
        'Concurrent prop updates do not cross instance boundaries',
        alphaUpdated.label === 'alpha-updated' && betaUpdated.label === 'beta-updated',
        `alpha: ${alphaUpdated.label}; beta: ${betaUpdated.label}`
      ));

      await alpha.close();
      const survivingState = await beta.exports!.readState();
      results.push(assertResult(
        'Closing one instance leaves its peer fully operational',
        alphaContainer.querySelectorAll('iframe').length === 0 &&
          betaContainer.querySelectorAll('iframe').length === 1 &&
          survivingState.label === 'beta-updated',
        `alpha frames: ${alphaContainer.querySelectorAll('iframe').length}; beta frames: ${betaContainer.querySelectorAll('iframe').length}; beta: ${survivingState.label}`
      ));

      await beta.close();
      results.push(assertResult(
        'Repeated and concurrent journeys finish without leaked instances',
        sandbox.querySelectorAll('iframe').length === 0 && Component.instances.length === 0,
        `frames: ${sandbox.querySelectorAll('iframe').length}; tracked: ${Component.instances.length}`
      ));
    } catch (error) {
      results.push(failure('Concurrent reliability journey completed', error));
      await Promise.all([
        alpha.close().catch(() => undefined),
        beta.close().catch(() => undefined),
      ]);
    }
  } catch (error) {
    countRenderUrlCalls = false;
    results.push(failure('Reliability browser scenario completed', error));
    await first.close().catch(() => undefined);
  }

  return results;
}

interface CommonActionsProps extends Record<string, unknown> {
  scenario: string;
  label: string;
  count: number;
  onAction: (message: string) => void;
}

interface CommonActionsExports {
  ready: boolean;
  getSnapshot: () => Promise<{ label: string; count: number }>;
  addToCount: (amount: number) => Promise<number>;
  notifyConsumer: (message: string) => Promise<boolean>;
}

export async function runCommonActionsScenario(
  sandbox: HTMLElement
): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const container = createContainer(sandbox);
  let callbackMessage = '';
  let focusEvents = 0;
  let closeEvents = 0;
  const Component = ForgeFrame.create<CommonActionsProps, CommonActionsExports>({
    tag: uniqueTag('common-actions'),
    url: `${HOST_URL}?scenario=common-actions`,
    dimensions: { width: '100%', height: 320 },
    props: {
      scenario: prop.string(),
      label: prop.string(),
      count: prop.number().int(),
      onAction: prop.function<(message: string) => void>(),
    },
  });
  const instance = Component({
    scenario: 'common-actions',
    label: 'initial',
    count: 2,
    onAction: (message) => { callbackMessage = message; },
  });
  instance.event.on('focus', () => { focusEvents += 1; });
  instance.event.on('close', () => { closeEvents += 1; });

  try {
    await instance.render(container);
    await waitFor(() => instance.exports?.ready);
    const iframe = container.querySelector<HTMLIFrameElement>('iframe')!;
    results.push(assertResult(
      'A normal component renders and exposes its ready API',
      iframe instanceof HTMLIFrameElement && instance.exports?.ready === true,
      `frame: ${Boolean(iframe)}; ready: ${String(instance.exports?.ready)}`
    ));

    await instance.updateProps({ label: 'updated', count: 7 });
    const snapshot = await instance.exports!.getSnapshot();
    results.push(assertResult(
      'A normal prop update is immediately available to host actions',
      snapshot.label === 'updated' && snapshot.count === 7,
      JSON.stringify(snapshot)
    ));

    const total = await instance.exports!.addToCount(5);
    results.push(assertResult(
      'A consumer can call a host method and receive its return value',
      total === 12,
      `7 + 5 returned ${total}`
    ));

    const notified = await instance.exports!.notifyConsumer('common-action-complete');
    results.push(assertResult(
      'A host method can call a consumer callback',
      notified && callbackMessage === 'common-action-complete',
      `notified: ${notified}; callback: ${callbackMessage}`
    ));

    await instance.resize({ width: '92%', height: 360 });
    results.push(assertResult(
      'A consumer can resize the active iframe',
      iframe.style.width === '92%' && iframe.style.height === '360px',
      `${iframe.style.width} × ${iframe.style.height}`
    ));

    await instance.hide();
    const hidden = iframe.style.display === 'none' && iframe.style.visibility === 'hidden';
    await instance.show();
    await instance.focus();
    results.push(assertResult(
      'Show, hide, and focus remain usable during the session',
      hidden && iframe.style.display === '' && iframe.style.visibility === 'visible' &&
        focusEvents === 1,
      `hidden observed: ${hidden}; final display: ${iframe.style.display || '(default)'}; focus events: ${focusEvents}`
    ));

    await instance.close();
    await instance.close();
    results.push(assertResult(
      'Close is safe to repeat and leaves no live frame or instance',
      closeEvents === 1 && container.querySelectorAll('iframe').length === 0 &&
        Component.instances.length === 0,
      `close events: ${closeEvents}; frames: ${container.querySelectorAll('iframe').length}; tracked: ${Component.instances.length}`
    ));
  } catch (error) {
    results.push(failure('Common actions browser scenario completed', error));
    await instance.close().catch(() => undefined);
  }

  return results;
}

export async function runRedirectScenario(
  sandbox: HTMLElement
): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const container = createContainer(sandbox);
  let callbackMessage = '';
  const redirectUrl = new URL('/redirect.html', window.location.origin);
  redirectUrl.searchParams.set('scenario', 'common-actions');
  const Component = ForgeFrame.create<CommonActionsProps, CommonActionsExports>({
    tag: uniqueTag('redirect'),
    url: redirectUrl.toString(),
    domain: [window.location.origin, HOST_ORIGIN],
    dimensions: { width: '100%', height: 320 },
    props: {
      scenario: prop.string(),
      label: prop.string(),
      count: prop.number().int(),
      onAction: prop.function<(message: string) => void>(),
    },
  });
  const instance = Component({
    scenario: 'common-actions',
    label: 'before-redirect',
    count: 4,
    onAction: (message) => { callbackMessage = message; },
  });

  try {
    await instance.render(container);
    await waitFor(() => instance.exports?.ready);
    results.push(assertResult(
      'The second allowed origin completes INIT after the redirect',
      redirectUrl.origin !== HOST_ORIGIN && instance.exports?.ready === true,
      `redirect origin: ${redirectUrl.origin}; host origin: ${HOST_ORIGIN}; ready: ${instance.exports?.ready}`
    ));

    await instance.updateProps({ label: 'after-redirect', count: 9 });
    const snapshot = await instance.exports!.getSnapshot();
    results.push(assertResult(
      'Prop updates target the verified post-redirect origin',
      snapshot.label === 'after-redirect' && snapshot.count === 9,
      JSON.stringify(snapshot)
    ));

    const total = await instance.exports!.addToCount(3);
    const notified = await instance.exports!.notifyConsumer('redirect-callback-complete');
    results.push(assertResult(
      'Exports and callbacks remain bidirectional after the redirect',
      total === 12 && notified && callbackMessage === 'redirect-callback-complete',
      `total: ${total}; notified: ${notified}; callback: ${callbackMessage}`
    ));

    await instance.close();
    results.push(assertResult(
      'The redirected frame tears down normally',
      container.querySelectorAll('iframe').length === 0 && Component.instances.length === 0,
      `frames: ${container.querySelectorAll('iframe').length}; tracked: ${Component.instances.length}`
    ));
  } catch (error) {
    results.push(failure('Redirect browser scenario completed', error));
    await instance.close().catch(() => undefined);
  }

  return results;
}

export async function runTimeoutRecoveryScenario(
  sandbox: HTMLElement
): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const timeoutContainer = createContainer(sandbox);
  const TimeoutComponent = ForgeFrame.create<ReliabilityProps, ReliabilityExports>({
    tag: uniqueTag('timeout'),
    url: `${HOST_URL}?scenario=reliability&initDelay=300`,
    timeout: 100,
    dimensions: { width: '100%', height: 260 },
    props: {
      scenario: prop.string(),
      label: prop.string(),
    },
  });
  const timedOut = TimeoutComponent({ scenario: 'reliability', label: 'too-slow' });
  let timeoutMessage = '';

  try {
    await timedOut.render(timeoutContainer);
  } catch (error) {
    timeoutMessage = error instanceof Error ? error.message : String(error);
  }

  results.push(assertResult(
    'A host that misses the INIT deadline rejects predictably',
    timeoutMessage.includes('did not initialize within 100ms'),
    timeoutMessage || 'render unexpectedly resolved'
  ));
  results.push(assertResult(
    'A timed-out render removes its frame and instance tracking',
    timeoutContainer.querySelectorAll('iframe').length === 0 &&
      TimeoutComponent.instances.length === 0,
    `frames: ${timeoutContainer.querySelectorAll('iframe').length}; tracked: ${TimeoutComponent.instances.length}`
  ));
  await timedOut.close().catch(() => undefined);

  const recoveryContainer = createContainer(sandbox);
  const RecoveryComponent = ForgeFrame.create<ReliabilityProps, ReliabilityExports>({
    tag: uniqueTag('timeout-recovery'),
    url: `${HOST_URL}?scenario=reliability`,
    dimensions: { width: '100%', height: 260 },
    props: {
      scenario: prop.string(),
      label: prop.string(),
    },
  });
  const recovered = RecoveryComponent({ scenario: 'reliability', label: 'recovered' });

  try {
    await recovered.render(recoveryContainer);
    await waitFor(() => recovered.exports?.ready);
    const state = await recovered.exports!.readState();
    results.push(assertResult(
      'A fresh component succeeds immediately after the timeout',
      state.label === 'recovered' && state.uid === recovered.uid,
      JSON.stringify(state)
    ));
  } catch (error) {
    results.push(failure('Timeout recovery render completed', error));
  } finally {
    await recovered.close().catch(() => undefined);
  }

  results.push(assertResult(
    'Recovery leaves the playground clean',
    sandbox.querySelectorAll('iframe').length === 0 &&
      RecoveryComponent.instances.length === 0,
    `frames: ${sandbox.querySelectorAll('iframe').length}; tracked: ${RecoveryComponent.instances.length}`
  ));

  return results;
}

export async function runStressScenario(
  sandbox: HTMLElement
): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const Component = ForgeFrame.create<ReliabilityProps, ReliabilityExports>({
    tag: uniqueTag('stress'),
    url: `${HOST_URL}?scenario=reliability`,
    dimensions: { width: '100%', height: 180 },
    props: {
      scenario: prop.string(),
      label: prop.string(),
    },
  });
  let renderedCount = 0;
  let updatedCount = 0;
  let cleanWaves = 0;
  const active = new Set<ReturnType<typeof Component>>();

  try {
    for (let wave = 0; wave < 5; wave += 1) {
      const entries = Array.from({ length: 4 }, (_, item) => {
        const label = `wave-${wave}-item-${item}`;
        const container = createContainer(sandbox);
        const instance = Component({ scenario: 'reliability', label });
        active.add(instance);
        return { container, instance, label };
      });

      await Promise.all(entries.map(({ container, instance }) => instance.render(container)));
      await Promise.all(entries.map(({ instance }) => waitFor(() => instance.exports?.ready)));
      renderedCount += entries.length;

      await Promise.all(entries.map(({ instance, label }) =>
        instance.updateProps({ label: `${label}-updated` })
      ));
      const states = await Promise.all(entries.map(({ instance }) => instance.exports!.readState()));
      updatedCount += states.filter((state, index) =>
        state.label === `${entries[index].label}-updated` &&
        state.uid === entries[index].instance.uid
      ).length;

      await Promise.all(entries.map(async ({ container, instance }) => {
        await instance.close();
        active.delete(instance);
        container.remove();
      }));
      if (Component.instances.length === 0 && sandbox.querySelectorAll('iframe').length === 0) {
        cleanWaves += 1;
      }
    }

    results.push(assertResult(
      'Twenty instances render and reach ready state',
      renderedCount === 20,
      `ready instances: ${renderedCount}/20`
    ));
    results.push(assertResult(
      'Twenty live prop updates round-trip to their own hosts',
      updatedCount === 20,
      `updated instances: ${updatedCount}/20`
    ));
    results.push(assertResult(
      'Every stress wave returns to a clean baseline',
      cleanWaves === 5,
      `clean waves: ${cleanWaves}/5`
    ));
    results.push(assertResult(
      'The complete stress journey leaves no frames or tracked instances',
      sandbox.querySelectorAll('iframe').length === 0 && Component.instances.length === 0,
      `frames: ${sandbox.querySelectorAll('iframe').length}; tracked: ${Component.instances.length}`
    ));
  } catch (error) {
    results.push(failure('Twenty-instance stress journey completed', error));
  } finally {
    await Promise.all([...active].map((instance) => instance.close().catch(() => undefined)));
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

function skipResult(name: string, detail: string): TestResult {
  return { name, status: 'skip', detail };
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
