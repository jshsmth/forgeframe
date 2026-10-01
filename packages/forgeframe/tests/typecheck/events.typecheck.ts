/** Typed subscriptions can be removed through the public instance event API. */
import type {
	EventEmitterInterface,
	EventHandler,
	ForgeFrameComponentInstance,
} from "@/index";

declare const instance: ForgeFrameComponentInstance;
declare const events: EventEmitterInterface;
const resizeHandler: EventHandler<{ width: number }> = (_dimensions) => {};

instance.event.on("resize", resizeHandler);
instance.event.off("resize", resizeHandler);
events.once("resize", resizeHandler);
events.off("resize", resizeHandler);
events.off<{ width: number }>("resize", resizeHandler);
events.off("resize");
// @ts-expect-error Explicit removal types must match the supplied handler.
events.off<{ width: string }>("resize", resizeHandler);
