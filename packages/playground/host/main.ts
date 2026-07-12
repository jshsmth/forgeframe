/**
 * Host Component Example
 *
 * This demonstrates how to use ForgeFrame from the host (embedded) side.
 * The host receives props from the consumer via window.hostProps.
 */
import { create, initHost, isHost, prop, type HostProps } from "forgeframe";

const NESTED_CHILD_TAG = 'playground-browser-nested-child';
const hostOrigin = window.location.origin;

create({
  tag: NESTED_CHILD_TAG,
  url: `${hostOrigin}/?scenario=nested-child`,
  dimensions: { width: '100%', height: 240 },
  props: { scenario: prop.string().optional() },
});

/**
 * Define your custom props interface.
 * These are the props passed from the consumer component.
 */
interface MyProps {
  name: string;
  count: number;
  onGreet: (message: string) => void;
  onClose: () => void;
  scenario?: string;
  onCalculate?: (left: number, right: number) => number | Promise<number>;
  onObservedProps?: (props: Record<string, unknown>) => void | Promise<void>;
  label?: string;
  status?: string;
  sessionId?: string;
  amount?: number;
  onApproved?: (receipt: { transactionId: string; amount: number }) => void | Promise<void>;
  onAction?: (message: string) => void | Promise<void>;
}

/**
 * Type window.hostProps using ForgeFrame's HostProps generic.
 * HostProps<MyProps> includes:
 * - All your custom props (name, count, onGreet, etc.)
 * - Built-in ForgeFrame methods (close, resize, focus, show, hide, export, etc.)
 * - Context info (uid, tag, getConsumerDomain, etc.)
 */
declare global {
  interface Window {
    hostProps?: HostProps<MyProps>;
  }
}

const app = document.getElementById("app")!;

/**
 * Render when embedded via ForgeFrame
 */
function renderEmbedded() {
  // window.hostProps is provided by ForgeFrame and contains:
  // - All props passed from consumer (name, count, onGreet, etc.)
  // - Built-in methods (close, resize, focus, show, hide, export, etc.)
  // - Context info (uid, tag, getConsumerDomain, etc.)
  const hostProps = window.hostProps!;

  // Built-in hostProps keys to exclude from "Received Props"
  const builtInKeys = new Set([
    'uid', 'tag', 'close', 'focus', 'resize', 'show', 'hide',
    'onProps', 'onError', 'getConsumer', 'getConsumerDomain', 'export',
    'consumer', 'getPeerInstances', 'children'
  ]);

  const getUserProps = () => {
    const userProps: Record<string, unknown> = {};
    const propsRecord = hostProps as unknown as Record<string, unknown>;
    for (const key of Object.keys(propsRecord)) {
      if (!builtInKeys.has(key) && typeof propsRecord[key] !== 'function') {
        userProps[key] = propsRecord[key];
      }
    }
    return userProps;
  };

  const renderPropsGrid = () => {
    const userProps = getUserProps();
    return Object.entries(userProps)
      .map(([key, value]) => `
        <dt>${key}</dt>
        <dd id="prop-${key}">${value}</dd>
      `).join('');
  };

  const render = () => {
    app.innerHTML = `
      <div class="header">
        <h2><span>Host</span> Component</h2>
        <span class="badge">${hostProps.tag}</span>
      </div>

      <div class="grid">
        <div class="card">
          <h3>Received Props</h3>
          <div class="card-content">
            <dl class="props-grid" id="props-display">
              ${renderPropsGrid()}
            </dl>
          </div>
        </div>

        <div class="card">
          <h3>Context Info</h3>
          <div class="card-content">
            <dl class="props-grid">
              <dt>uid</dt>
              <dd>${hostProps.uid.slice(0, 12)}...</dd>
              <dt>consumer</dt>
              <dd>${hostProps.getConsumerDomain()}</dd>
            </dl>
          </div>
        </div>

        <div class="card full">
          <h3>Call Consumer Functions</h3>
          <div class="card-content">
            <div class="buttons">
              <div class="button-group">
                <span class="button-group-label">Communication</span>
                <button id="btn-greet" class="success">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  Send Greeting
                </button>
                <button id="btn-export" class="info">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  Export Data
                </button>
              </div>
              <div class="button-group">
                <span class="button-group-label">Actions</span>
                <button id="btn-error" class="warning">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  Report Error
                </button>
                <button id="btn-close" class="danger">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                  Request Close
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="card full">
          <h3>Control Iframe</h3>
          <div class="card-content">
            <div class="buttons">
              <div class="button-group">
                <span class="button-group-label">Resize</span>
                <button id="btn-resize-grow">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
                  Grow (500px)
                </button>
                <button id="btn-resize-shrink">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
                  Shrink (300px)
                </button>
              </div>
              <div class="button-group">
                <span class="button-group-label">Window</span>
                <button id="btn-focus">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
                  Focus
                </button>
                <button id="btn-hide">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  Hide
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <p class="status" id="status">Ready</p>
    `;

    bindEventHandlers();
  };

  const setStatus = (msg: string) => {
    const el = document.getElementById("status");
    if (el) el.textContent = msg;
  };

  const bindEventHandlers = () => {
    // Call consumer function prop
    document.getElementById("btn-greet")?.addEventListener("click", () => {
      // hostProps.name and hostProps.count are always current (updated by ForgeFrame)
      const message = `Hello! Name: ${hostProps.name}, Count: ${hostProps.count}`;
      hostProps.onGreet(message);
      setStatus("Sent greeting to consumer");
    });

    // Export data to consumer
    document
      .getElementById("btn-export")
      ?.addEventListener("click", async () => {
        await hostProps.export({
          exportedAt: new Date().toISOString(),
          data: { name: hostProps.name, count: hostProps.count },
        });
        setStatus("Exported data to consumer");
      });

    // Report error to consumer
    document.getElementById("btn-error")?.addEventListener("click", () => {
      hostProps.onError(new Error("Test error from host"));
      setStatus("Reported error to consumer");
    });

    // Request close (calls consumer's onClose callback)
    document.getElementById("btn-close")?.addEventListener("click", () => {
      hostProps.onClose();
    });

    // Resize the iframe
    document
      .getElementById("btn-resize-grow")
      ?.addEventListener("click", async () => {
        await hostProps.resize({ height: 500 });
        setStatus("Resized to 500px");
      });

    document
      .getElementById("btn-resize-shrink")
      ?.addEventListener("click", async () => {
        await hostProps.resize({ height: 300 });
        setStatus("Resized to 300px");
      });

    // Focus the iframe
    document
      .getElementById("btn-focus")
      ?.addEventListener("click", async () => {
        await hostProps.focus();
        setStatus("Focused");
      });

    // Hide the iframe
    document.getElementById("btn-hide")?.addEventListener("click", async () => {
      await hostProps.hide();
      setStatus("Hidden (use consumer Show button)");
    });
  };

  // Initial render
  render();

  // Listen for prop updates from consumer
  hostProps.onProps((newProps) => {
    console.log("[Host] Props updated:", newProps);
    // Update UI with new values - handle any prop dynamically
    for (const [key, value] of Object.entries(newProps)) {
      const el = document.getElementById(`prop-${key}`);
      if (el) {
        el.textContent = String(value);
      }
    }
    setStatus("Props updated");
    if (hostProps.scenario === 'props') {
      void hostProps.onObservedProps?.(newProps as Record<string, unknown>);
    }
  });

  const exportInitialData = async () => {
    if (hostProps.scenario === 'configuration') {
      await hostProps.export({ observed: getUserProps() });
      return;
    }

    if (hostProps.scenario === 'instances') {
      const peers = await hostProps.getPeerInstances();
      await hostProps.export({
        instanceLabel: hostProps.label,
        peerUids: peers.map((peer) => peer.uid),
        peerCount: peers.length,
      });
      return;
    }

    if (hostProps.scenario === 'host-controls') {
      await hostProps.export({
        runControls: async () => {
          await hostProps.resize({ width: 460, height: 350 });
          await hostProps.focus();
          await hostProps.hide();
          await new Promise((resolve) => setTimeout(resolve, 120));
          await hostProps.show();
          return {
            consumerDomain: hostProps.getConsumerDomain(),
            parentMatched: hostProps.getConsumer() === window.parent,
          };
        },
        requestClose: async () => {
          setTimeout(() => void hostProps.close(), 60);
          return true;
        },
      });
      return;
    }

    if (hostProps.scenario === 'transport') {
      await hostProps.export({ observed: getUserProps() });
      return;
    }

    if (hostProps.scenario === 'reliability') {
      await hostProps.export({
        ready: true,
        readState: () => ({
          label: hostProps.label ?? '',
          uid: hostProps.uid,
        }),
      });
      return;
    }

    if (hostProps.scenario === 'common-actions') {
      await hostProps.export({
        ready: true,
        getSnapshot: () => ({
          label: hostProps.label ?? '',
          count: hostProps.count ?? 0,
        }),
        addToCount: (amount: number) => (hostProps.count ?? 0) + amount,
        notifyConsumer: async (message: string) => {
          await hostProps.onAction?.(message);
          return true;
        },
      });
      return;
    }

    if (hostProps.scenario === 'popup') {
      await hostProps.export({
        popupReady: true,
        hasOpener: window.opener !== null,
        consumerDomain: hostProps.getConsumerDomain(),
      });
      return;
    }

    if (hostProps.scenario === 'checkout-e2e') {
      await hostProps.export({
        checkoutReady: true,
        submitPayment: async (token: string) => {
          const receipt = {
            transactionId: 'txn-browser-e2e',
            amount: hostProps.amount ?? 0,
          };
          await hostProps.onApproved?.(receipt);
          return {
            ...receipt,
            status: hostProps.status,
            tokenAccepted: token === 'tok_browser_success',
            sessionId: hostProps.sessionId,
          };
        },
      });
      return;
    }

    if (hostProps.scenario === 'bridge' && hostProps.onCalculate) {
      const callbackResult = await hostProps.onCalculate(19, 23);
      await hostProps.export({
        ready: true,
        callbackResult,
        multiply: (left: number, right: number) => left * right,
        exportedAt: new Date(),
      });
      return;
    }

    if (hostProps.scenario === 'nested-parent') {
      const ChildComponent = hostProps.children?.Child;
      if (!ChildComponent) {
        throw new Error('Nested child was not resolved from the host registry');
      }

      const nestedMount = document.createElement('div');
      nestedMount.id = 'nested-child-container';
      Object.assign(nestedMount.style, {
        marginTop: '12px',
        border: '1px solid #e8e8e8',
        borderRadius: '8px',
        overflow: 'hidden',
      });
      app.appendChild(nestedMount);

      const childInstance = ChildComponent({ scenario: 'nested-child' });
      await childInstance.render(nestedMount);
      await waitFor(() => childInstance.exports !== undefined);
      await hostProps.export({
        nestedReady: true,
        childTag: NESTED_CHILD_TAG,
        childExportReady: Boolean(
          (childInstance.exports as { nestedChildReady?: boolean } | undefined)
            ?.nestedChildReady
        ),
      });
      return;
    }

    if (hostProps.scenario === 'nested-child') {
      await hostProps.export({ nestedChildReady: true });
      return;
    }

    if (hostProps.scenario === 'errors') {
      await hostProps.export({
        explode: () => {
          throw new Error('Expected host function failure');
        },
      });
      await hostProps.onError(new Error('Expected host-reported error'));
      return;
    }

    await hostProps.export({ ready: true, timestamp: Date.now() });
  };

  void exportInitialData().catch((error: unknown) => {
    const hostError = error instanceof Error ? error : new Error(String(error));
    console.error('[Host] Initial export failed:', hostError);
    void hostProps.onError(hostError);
  });
}

async function waitFor(read: () => boolean, timeoutMs = 4000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (read()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out after ${timeoutMs}ms`);
}

/**
 * Render when opened directly (not embedded)
 */
function renderStandalone() {
  const consumerUrl = import.meta.env.VITE_CONSUMER_URL || 'https://localhost:5173';
  app.innerHTML = `
    <div class="not-embedded">
      <h2>Host Component</h2>
      <p>This page is designed to be embedded via ForgeFrame.</p>
      <p>Open <code>${consumerUrl}</code> and click <strong>Render</strong>.</p>
      <p class="hint">window.hostProps is not available (no ForgeFrame payload)</p>
    </div>
  `;
}

// Explicitly initialize the host runtime before reading window.hostProps.
initHost();

// Check if running as ForgeFrame host
if (isHost()) {
  renderEmbedded();
} else {
  renderStandalone();
}
