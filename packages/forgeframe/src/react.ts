/**
 * @packageDocumentation
 * React integration for ForgeFrame, published as `forgeframe/react`.
 *
 * @remarks
 * Requires the optional `react` peer dependency. The root `forgeframe` entry
 * contains no React code.
 *
 * @example
 * ```tsx
 * import { create } from 'forgeframe';
 * import { createReactComponent } from 'forgeframe/react';
 *
 * const Login = createReactComponent(
 *   create({ tag: 'login', url: 'https://auth.example.com/login' }),
 * );
 * ```
 */

export {
	createReactComponent,
	type ReactComponentOf,
	type ReactComponentProps,
	type ReactInstance,
} from "./drivers/react";
