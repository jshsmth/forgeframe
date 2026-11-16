---
name: guide/react
title: React Integration
desc: React wrapper props, the instanceRef handle, prop syncing, server rendering, Server Components, and Preact.
tags: []
sources: []
created: 2026-11-16T03:15:22Z
updated: 2026-11-16T03:15:22Z
---

# React Integration

The [README's React section](../../README.md#react-integration-optional) covers installing `forgeframe/react` and a basic `createReactComponent` example. This page is the reference for the wrapper it returns.

## React Props

The React component accepts your component props alongside these wrapper props:

| Prop | Type | Description |
|------|------|-------------|
| `onRendered` | `() => void` | Called once the instance has rendered, right after `instanceRef` receives it |
| `onError` | `(err: Error) => void` | The instance's `error` event, plus construction, render, and prop-sync failures. Library failures are [`ForgeFrameError`s](../../README.md#errors); branch on `err.code`, such as `POPUP_BLOCKED` |
| `onClose` | `() => void` | The instance's `close` event: the host or the user closed it, `instanceRef.current.close()` was called, or the wrapper unmounted or changed `context` |
| `context` | `'iframe' \| 'popup'` | Render mode; changing it closes the instance and renders a new one |
| `instanceRef` | `React.Ref<ReactInstance<Exports>>` | Receives the rendered instance, and `null` when it closes, the wrapper unmounts, `context` changes, or rendering fails. Accepts a ref object or a callback ref |
| `className` | `string` | Container CSS class |
| `style` | `React.CSSProperties` | Container inline styles |
| `ref` | `React.Ref<HTMLDivElement>` | Access the wrapper's container element. It is attached during React's commit, so a parent's `useLayoutEffect` can read it, and React 19 callback-ref cleanups run on unmount |

The handle `instanceRef` receives (`ReactInstance<Exports>`) has the instance's `uid`, `exports`, `event` (`on` and `once`, including the `exports` event), `resize()`, `focus()`, `show()`, `hide()` and `close()`. It has no `render()` or `updateProps()`: the wrapper renders the instance and sends prop changes itself. It is set only after `render()` resolves, so every method works on it; while the frame loads it is `null`.

These names are reserved: `createReactComponent` throws a `VALIDATION` error for a component that declares a prop named `onRendered`, `onError`, `onClose`, `context`, `instanceRef`, `className`, `style`, `ref` or `key` (React keeps `ref` and `key` for itself). Give such a prop another name, such as `onHostClose`.

Removing a prop from your JSX resets it exactly as `updateProps({ key: undefined })` does, and passing `undefined` counts as leaving the prop out, so `theme={dark ? 'dark' : undefined}` sends no update when it switches between the two. Commits made while the frame is still loading reach the host in order once it has started. After the instance closes, prop changes are not sent until a new instance renders (change `context` or the React `key`).

Construction and render failures go to `onError` and are shown inside the wrapper; sibling React content is unaffected, and the container ref stays attached. To recover, change `context` (which creates a fresh instance) or change the wrapper's React `key` to remount it.

## Server rendering, React Server Components and Preact

- **Server rendering:** importing `forgeframe/react` has no side effects. On the server the wrapper renders only its container `div`; effects do not run, so no instance is created until the client hydrates.
- **React Server Components:** the wrapper uses hooks, so render it inside a client component (a file with `"use client"`).
- **Preact:** alias `react` to `preact/compat` in your bundler (for example `resolve.alias: { react: 'preact/compat' }` in Vite).
