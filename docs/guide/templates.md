---
name: guide/templates
title: Templates
desc: Container and prerender templates for custom chrome and loading states.
tags: []
sources: []
created: 2026-11-16T03:15:22Z
updated: 2026-11-16T03:15:22Z
---

# Templates

Templates are optional component options that replace the default wrapper around an iframe and the placeholder shown while the host loads.

## Container Template

`containerTemplate` builds the element that wraps the iframe, such as a modal overlay.

```typescript
const ModalComponent = create({
  tag: 'modal',
  url: 'https://widgets.example.com/modal',
  dimensions: { width: 500, height: 400 },

  containerTemplate: ({ doc, frame, prerenderFrame, close }) => {
    const overlay = doc.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0',
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: '1000',
    });
    overlay.onclick = (e) => { if (e.target === overlay) close(); };

    const modal = doc.createElement('div');
    Object.assign(modal.style, { background: 'white', borderRadius: '8px', overflow: 'hidden' });

    const closeBtn = doc.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.onclick = () => close();
    modal.appendChild(closeBtn);

    const body = doc.createElement('div');
    if (prerenderFrame) body.appendChild(prerenderFrame);
    if (frame) body.appendChild(frame);
    modal.appendChild(body);

    overlay.appendChild(modal);
    return overlay;
  },
});
```

## Prerender Template

`prerenderTemplate` builds the placeholder shown while the host loads.

```typescript
const toCssSize = (value?: string | number) =>
  typeof value === 'number' ? `${value}px` : (value ?? '');

const MyComponent = create({
  tag: 'my-component',
  url: 'https://widgets.example.com/component',

  prerenderTemplate: ({ doc, dimensions }) => {
    const loader = doc.createElement('div');
    Object.assign(loader.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: toCssSize(dimensions.width),
      height: toCssSize(dimensions.height),
      background: '#f5f5f5',
    });
    loader.textContent = 'Loading...';
    return loader;
  },
});
```
