/** ForgeFrameError, its code union and the renamed public types. */
import {
	type ComponentInstance,
	ForgeFrameError,
	type ForgeFrameErrorCode,
	type HostProps,
	type OriginMatcher,
} from "@/index";

declare const caught: unknown;

if (caught instanceof ForgeFrameError) {
	const code: ForgeFrameErrorCode = caught.code;
	const cause: unknown = caught.cause;
	const name: string = caught.name;
	void code;
	void cause;
	void name;
	// @ts-expect-error code is read-only
	caught.code = "CLOSED";
}

/** An exhaustive switch over the codes compiles only while it covers each one. */
function describeCode(code: ForgeFrameErrorCode): string {
	switch (code) {
		case "POPUP_BLOCKED":
			return "Allow popups";
		case "INIT_TIMEOUT":
			return "Try again";
		case "VALIDATION":
			return "Fix the configuration";
		case "ORIGIN_REJECTED":
			return "This page cannot be embedded here";
		case "CANCELLED":
			return "";
		case "CLOSED":
			return "Closed";
		case "CAPACITY":
			return "Too many callbacks";
		default: {
			const unreachable: never = code;
			return unreachable;
		}
	}
}
void describeCode;

const applicationError = new ForgeFrameError("VALIDATION", "Bad input", {
	cause: new Error("schema"),
});
void applicationError;
// @ts-expect-error codes are a fixed set
new ForgeFrameError("TIMEOUT", "Not a code");

const matcher: OriginMatcher = ["https://a.example", /^https:\/\/b\./];
void matcher;
// @ts-expect-error DomainMatcher was renamed OriginMatcher
type RemovedDomainMatcher = import("@/index").DomainMatcher;
// @ts-expect-error PopupOpenError was replaced by ForgeFrameError with POPUP_BLOCKED
type RemovedPopupOpenError = import("@/index").PopupOpenError;
export type RemovedErrorTypes = [RemovedDomainMatcher, RemovedPopupOpenError];

declare const hostProps: HostProps<{ amount: number }>;
const consumerOrigin: string = hostProps.consumerOrigin;
void consumerOrigin;
// @ts-expect-error consumerOrigin is read-only
hostProps.consumerOrigin = "https://other.example";
// @ts-expect-error getConsumerDomain() was replaced by consumerOrigin
hostProps.getConsumerDomain();

declare const instance: ComponentInstance<{ amount: number }>;
instance.event.on("error", (error) => {
	const asError: Error = error;
	void asError;
});
