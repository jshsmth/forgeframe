/**
 * Component rendering for ForgeFrame Playground
 */
import ForgeFrame, { prop, type PropSchema } from 'forgeframe';
import { elements } from './elements';
import { log, setStatus, setButtonsEnabled } from './logger';
import {
  currentContext,
  currentIframeStyle,
  currentConfig,
  currentPropValues,
  componentCache,
  instance,
  modalOverlay,
  modalBody,
  setInstance,
  setModalOverlay,
  setModalBody,
  setPropValue,
} from './state';
import type { PlaygroundConfig, DynamicProps } from './types';

/**
 * Maps string type names to prop schema builders
 */
function createPropSchema(typeStr: string, options: { required?: boolean; default?: unknown }): PropSchema<unknown> {
  const { required, default: defaultValue } = options;

  let schema: PropSchema<unknown>;

  switch (typeStr.toUpperCase()) {
    case 'NUMBER':
      schema = prop.number();
      break;
    case 'BOOLEAN':
      schema = prop.boolean();
      break;
    case 'FUNCTION':
      schema = prop.function();
      break;
    case 'ARRAY':
      schema = prop.array();
      break;
    case 'OBJECT':
      schema = prop.object();
      break;
    case 'STRING':
    default:
      schema = prop.string();
      break;
  }

  if (defaultValue !== undefined) {
    schema = schema.default(defaultValue as never);
  }

  if (!required) {
    schema = schema.optional();
  }

  return schema;
}

export function buildPropsSchema(config: PlaygroundConfig) {
  const schema: Record<string, PropSchema<unknown>> = {};

  // Add user-defined props from config
  for (const [key, def] of Object.entries(config.props || {})) {
    const propDef = def as Record<string, unknown>;
    const typeStr = (propDef.type as string) || 'STRING';

    schema[key] = createPropSchema(typeStr, {
      required: propDef.required as boolean,
      default: propDef.default,
    });
  }

  // Always add callback props (optional functions)
  schema.onGreet = prop.function().optional();
  schema.onClose = prop.function().optional();

  return schema;
}

export function createModalTemplate(config: PlaygroundConfig) {
  const cacheKey = `${config.tag}-modal-${JSON.stringify(config.modalStyle || {})}`;
  if (componentCache.has(cacheKey)) {
    return componentCache.get(cacheKey)!;
  }

  const ms = config.modalStyle || {};
  const modalWidth = ms.width || 500;
  const modalHeight = ms.height || 400;

  const component = ForgeFrame.create<DynamicProps>({
    tag: `${config.tag}-modal-${Date.now()}`, // Unique tag to allow style changes
    url: config.url,
    dimensions: { width: modalWidth, height: modalHeight },
    style: {
      border: 'none',
      borderRadius: `0 0 ${ms.borderRadius || '8px'} ${ms.borderRadius || '8px'}`,
      ...config.style,
    },
    containerTemplate: ({ doc, frame, prerenderFrame, close, uid }) => {
      const overlay = doc.createElement('div');
      overlay.id = `forgeframe-modal-${uid}`;
      Object.assign(overlay.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        right: '0',
        bottom: '0',
        background: ms.overlayBackground || 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: '10000',
      });

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
      });

      const modal = doc.createElement('div');
      Object.assign(modal.style, {
        background: ms.boxBackground || '#fff',
        borderRadius: ms.borderRadius || '8px',
        boxShadow: ms.boxShadow || '0 20px 60px rgba(0, 0, 0, 0.3)',
        overflow: 'hidden',
        border: `1px solid ${ms.borderColor || '#e0e0e0'}`,
      });

      const header = doc.createElement('div');
      Object.assign(header.style, {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0.75rem 1rem',
        background: ms.headerBackground || '#fafafa',
        borderBottom: `1px solid ${ms.borderColor || '#eee'}`,
      });

      const title = doc.createElement('span');
      title.textContent = 'ForgeFrame Component';
      Object.assign(title.style, {
        fontSize: '0.875rem',
        color: ms.headerColor || '#333',
        fontWeight: '500',
      });

      const closeBtn = doc.createElement('button');
      closeBtn.innerHTML = '&times;';
      Object.assign(closeBtn.style, {
        background: 'none',
        border: 'none',
        fontSize: '1.5rem',
        cursor: 'pointer',
        color: '#888',
        padding: '0',
        lineHeight: '1',
      });
      closeBtn.addEventListener('click', () => close());

      header.appendChild(title);
      header.appendChild(closeBtn);

      const body = doc.createElement('div');
      Object.assign(body.style, {
        width: `${modalWidth}px`,
        height: `${modalHeight}px`,
        position: 'relative',
      });

      if (prerenderFrame) body.appendChild(prerenderFrame);
      if (frame) body.appendChild(frame);

      modal.appendChild(header);
      modal.appendChild(body);
      overlay.appendChild(modal);

      setModalOverlay(overlay);
      setModalBody(body);
      return overlay;
    },
    props: buildPropsSchema(config),
  });

  componentCache.set(cacheKey, component);
  return component;
}

export function createComponent(config: PlaygroundConfig, context: 'iframe' | 'popup' = 'iframe') {
  // Create fresh component with unique tag each time to avoid registration conflicts
  // (unlike modals which can be cached since they append to body fresh each time)
  const uniqueTag = `${config.tag}-${Date.now()}`;

  // For popup context, use modalStyle dimensions as fallback since '100%' doesn't work for popups
  let dimensions = config.dimensions as { width?: string | number; height?: string | number };
  if (context === 'popup') {
    const ms = config.modalStyle || {};
    dimensions = {
      width: ms.width || 500,
      height: ms.height || 400,
    };
  }

  const component = ForgeFrame.create<DynamicProps>({
    tag: uniqueTag,
    url: config.url,
    dimensions,
    style: config.style as Record<string, string>,
    attributes: config.attributes,
    timeout: config.timeout,
    props: buildPropsSchema(config),
  });

  return component;
}

export async function renderComponent() {
  if (instance) {
    log('Component already rendered', 'info');
    return;
  }

  const config = currentConfig;

  // Sync prop values from inputs before render
  elements.propsBar.querySelectorAll('input[data-prop]').forEach((input) => {
    const propName = (input as HTMLInputElement).dataset.prop!;
    const propDef = (config.props || {})[propName] as Record<string, unknown> | undefined;
    let value: unknown = (input as HTMLInputElement).value;

    const type = ((propDef?.type as string) || '').toLowerCase();
    if (type === 'number') {
      value = parseFloat((input as HTMLInputElement).value) || 0;
    } else if (type === 'boolean') {
      value = (input as HTMLInputElement).value === 'true';
    }

    setPropValue(propName, value);
  });

  const modeLabel = currentContext === 'popup'
    ? 'popup'
    : `iframe (${currentIframeStyle})`;

  log(`Rendering as ${modeLabel}...`, 'info');
  setStatus('Rendering...', 'idle');

  try {
    // Use modal template only for iframe context with modal style
    const useModal = currentContext === 'iframe' && currentIframeStyle === 'modal';
    const Component = useModal
      ? createModalTemplate(config)
      : createComponent(config, currentContext);

    // Build props object with current values + callbacks
    const props: DynamicProps = {
      ...currentPropValues,
      onGreet: (message: string) => {
        log(`Host says: ${message}`, 'success');
      },
      onClose: () => {
        log('Host requested close', 'info');
        instance?.close();
      },
      onError: (error: Error) => {
        log(`Host error: ${error.message}`, 'error');
      },
    };

    const newInstance = Component(props);
    setInstance(newInstance);

    // Subscribe to events
    newInstance.event.on('rendered', () => {
      log('Event: rendered', 'success');
    });
    newInstance.event.on('close', () => {
      log('Event: close', 'info');
      setInstance(null);
      setStatus('Closed', 'idle');
      setButtonsEnabled(false);
      if (modalOverlay) {
        modalOverlay.remove();
        setModalOverlay(null);
        setModalBody(null);
      }
      // Clear container for embedded iframes (keep only the placeholder)
      if (!useModal) {
        const placeholder = elements.container.querySelector('.container-placeholder');
        elements.container.innerHTML = '';
        if (placeholder) {
          elements.container.appendChild(placeholder);
        } else {
          const newPlaceholder = document.createElement('div');
          newPlaceholder.className = 'container-placeholder';
          newPlaceholder.textContent = 'Click "Render" to load component';
          elements.container.appendChild(newPlaceholder);
        }
      }
    });
    newInstance.event.on('error', (err) => {
      log(`Event: error - ${err}`, 'error');
    });
    newInstance.event.on('resize', (dims) => {
      log(`Event: resize - ${JSON.stringify(dims)}`, 'info');
      // Also resize the modal body container if in modal mode
      if (useModal && modalBody && dims) {
        const { width, height } = dims as { width?: number | string; height?: number | string };
        if (width !== undefined) {
          modalBody.style.width = typeof width === 'number' ? `${width}px` : width;
        }
        if (height !== undefined) {
          modalBody.style.height = typeof height === 'number' ? `${height}px` : height;
        }
      }
    });
    newInstance.event.on('focus', () => {
      log('Event: focus', 'info');
    });

    const container = useModal ? document.body : '#component-container';

    await newInstance.render(container, currentContext);

    setStatus('Rendered', 'rendered');
    setButtonsEnabled(true);
    log(`Component rendered successfully (${modeLabel})`, 'success');
  } catch (err) {
    log(`Render failed: ${err}`, 'error');
    setStatus('Failed', 'error');
    setInstance(null);
  }
}
