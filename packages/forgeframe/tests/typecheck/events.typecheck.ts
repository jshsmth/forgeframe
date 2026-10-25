/** Typed lifecycle subscriptions through the public instance event API. */
import type {
	ComponentEvents,
	Dimensions,
	EventSubscriber,
	ForgeFrameComponentInstance,
} from "@/index";

type Props = { amount: number };
type Exports = { submit: () => Promise<string> };

declare const instance: ForgeFrameComponentInstance<Props, Exports>;

const stopResize: () => void = instance.event.on("resize", (dimensions) => {
	const size: Dimensions = dimensions;
	void size;
});
stopResize();
const stopOnce: () => void = instance.event.once("rendered", () => {});
stopOnce();

instance.event.on("error", (error) => {
	const message: string = error.message;
	void message;
});
instance.event.on("props", (props) => {
	const amount: number = props.amount;
	void amount;
});
instance.event.on("exports", (exports) => {
	const submitted: Promise<string> = exports.submit();
	void submitted;
});
for (const name of [
	"render",
	"rendered",
	"close",
	"closed",
	"focus",
] as const) {
	instance.event.on(name, () => {});
}

// @ts-expect-error Removed v1 event names fail type-checking.
instance.event.on("destroy", () => {});
// @ts-expect-error Removed v1 event names fail type-checking.
instance.event.once("display", () => {});
// @ts-expect-error Misspelled event names fail type-checking.
instance.event.on("renderd", () => {});
// @ts-expect-error Handlers receive the event's payload type.
instance.event.on("resize", (dimensions: { width: string }) => {
	void dimensions;
});

// @ts-expect-error Only ForgeFrame emits lifecycle events.
instance.event.emit("closed");
// @ts-expect-error Unsubscribe functions replace off().
instance.event.off("resize");
// @ts-expect-error Unsubscribe functions replace removeAllListeners().
instance.event.removeAllListeners();

const subscriber: EventSubscriber<ComponentEvents<Props, Exports>> =
	instance.event;
void subscriber;
