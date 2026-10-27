import { expect, type Frame, type Page } from "@playwright/test";

/**
 * The first frame of `page` whose URL starts with `origin`, polled until it
 * exists. `page.frames()` is a snapshot, so a lookup right after a render can
 * miss a frame that is still attaching; this retries like a locator does.
 * Use it for `evaluate`; for DOM assertions, use `locator(...).contentFrame()`.
 */
export async function hostFrame(page: Page, origin: string): Promise<Frame> {
	let found: Frame | undefined;
	await expect
		.poll(
			() => {
				found = page.frames().find((frame) => frame.url().startsWith(origin));
				return found !== undefined;
			},
			{ message: `a frame at ${origin}` },
		)
		.toBe(true);
	if (!found) throw new Error(`Missing frame at ${origin}`);
	return found;
}
