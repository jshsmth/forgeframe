/**
 * Compile-time assertions for `forgeframe/react`: the single-argument
 * factory, JSX props inferred from the component (requiredness and the
 * factory input kept), the container `ref`, `instanceRef` typed by the
 * component's exports, `style` as React CSS properties, and the removed v1
 * React API.
 */
import {
	type ComponentProps,
	type CSSProperties,
	createRef,
	type ReactElement,
} from "react";
import { z } from "zod";
import {
	type AnyComponent,
	create,
	type PropDefinition,
	prop,
} from "../../src";
import {
	createReactComponent,
	type ReactComponentOf,
	type ReactComponentProps,
	type ReactInstance,
} from "../../src/react";

const RequiredComponent = create({
	tag: "required-react-typecheck",
	url: "https://example.com/required",
	props: { label: prop.string() },
	exports: prop.object({
		ready: prop.boolean(),
		total: prop.function<() => number>(),
	}),
});
const RequiredReact = createReactComponent(RequiredComponent);
const annotated: ReactComponentOf<typeof RequiredComponent> = RequiredReact;
void annotated;

const requiredElement: ReactElement = <RequiredReact label="ready" />;
void requiredElement;
// @ts-expect-error required inputs stay required in JSX
const missingRequired = <RequiredReact />;
// @ts-expect-error a required prop still rejects undefined in JSX
const requiredUndefined = <RequiredReact label={undefined} />;
void missingRequired;
void requiredUndefined;

// An entry annotated as PropDefinition<T> keeps T as its JSX input.
const annotatedCode: PropDefinition<string> = { schema: prop.string() };
const AnnotatedReact = createReactComponent(
	create({
		tag: "annotated-react-typecheck",
		url: "https://example.com/annotated",
		props: { code: annotatedCode },
	}),
);
const annotatedElement = <AnnotatedReact code="a" />;
// @ts-expect-error an annotated entry stays required in JSX
const annotatedMissing = <AnnotatedReact />;
// @ts-expect-error an annotated entry keeps its type as JSX input
const annotatedWrongType = <AnnotatedReact code={42} />;
void annotatedElement;
void annotatedMissing;
void annotatedWrongType;

// The container ref is the wrapper's div.
const containerRef = createRef<HTMLDivElement>();
const withContainerRef = <RequiredReact label="ready" ref={containerRef} />;
const withCallbackRef = (
	<RequiredReact
		label="ready"
		ref={(container) => {
			const div: HTMLDivElement | null = container;
			void div;
		}}
	/>
);
const svgRef = createRef<SVGSVGElement>();
// @ts-expect-error wrappers forward an HTML div container, not an SVG element
const invalidRef = <RequiredReact label="ready" ref={svgRef} />;
void withContainerRef;
void withCallbackRef;
void invalidRef;

// instanceRef is typed by the component's exports.
const instanceRef =
	createRef<ReactInstance<{ ready: boolean; total: () => number }>>();
const withInstanceRef = (
	<RequiredReact label="ready" instanceRef={instanceRef} />
);
void withInstanceRef;
const handle = instanceRef.current;
if (handle) {
	const ready: boolean | undefined = handle.exports?.ready;
	const total: Promise<number> | undefined = handle.exports?.total();
	handle.resize({ width: 300 });
	handle.focus();
	handle.show();
	handle.hide();
	const closing: Promise<void> = handle.close();
	const unsubscribe: () => void = handle.event.on("exports", (exports) => {
		const value: boolean = exports.ready;
		void value;
	});
	// @ts-expect-error the wrapper owns prop synchronization
	void handle.updateProps({ label: "x" });
	// @ts-expect-error the wrapper owns rendering
	void handle.render("#container");
	void ready;
	void total;
	void closing;
	void unsubscribe;
}
const withCallbackInstanceRef = (
	<RequiredReact
		label="ready"
		instanceRef={(instance) => {
			const uid: string | undefined = instance?.uid;
			void uid;
		}}
	/>
);
const otherRef = createRef<ReactInstance<{ ready: string }>>();
// @ts-expect-error the handle carries this component's exports, not another's
const wrongExports = <RequiredReact label="ready" instanceRef={otherRef} />;
void withCallbackInstanceRef;
void wrongExports;

// style accepts React CSS properties.
const style: CSSProperties = { display: "block", opacity: 0.5 };
const styled = <RequiredReact label="ready" style={style} className="embed" />;
// @ts-expect-error style takes React CSS properties, not a CSS string
const badStyle = <RequiredReact label="ready" style="display: block" />;
void styled;
void badStyle;

const wrapperProps: ReactComponentProps = { context: "popup" };
void wrapperProps;

// Optional inputs may be left out or passed as undefined.
const OptionalComponent = create({
	tag: "optional-react-typecheck",
	url: "https://example.com/optional",
	props: { label: prop.string().optional() },
});
const OptionalReact = createReactComponent(OptionalComponent);
const optionalElement: ReactElement = <OptionalReact />;
const optionalUndefined: ReactElement = <OptionalReact label={undefined} />;
void optionalElement;
void optionalUndefined;

// The wrapper accepts the factory input: coercions widen it, defaults make keys optional.
const CoercingComponent = create({
	tag: "coercing-react-typecheck",
	url: "https://example.com/coercing",
	props: { amount: z.coerce.number(), count: prop.number().default(0) },
});
const CoercingReact = createReactComponent(CoercingComponent);
const coerced = <CoercingReact amount="4" />;
// @ts-expect-error the factory input still rejects other types
const badInput = <CoercingReact amount="4" count="1" />;
void coerced;
void badInput;
const coercingProps: ComponentProps<typeof CoercingReact> = { amount: "4" };
void coercingProps;

// A generic helper constrained by AnyComponent.
function wrap<C extends AnyComponent>(component: C): ReactComponentOf<C> {
	return createReactComponent(component);
}
void wrap(OptionalComponent);

// @ts-expect-error React comes from the peer dependency; there is no second argument
createReactComponent(RequiredComponent, { React: {} });

// @ts-expect-error the root entry no longer exports the React adapter
import { createReactComponent as rootFactory } from "../../src";
// @ts-expect-error withReactComponent was removed
import { withReactComponent } from "../../src/react";

void rootFactory;
void withReactComponent;
