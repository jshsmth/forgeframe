/**
 * Represents a deferred promise with externally accessible resolve and reject functions.
 *
 * @typeParam T - The type of value the promise will resolve to
 *
 * @remarks
 * This interface is useful when you need to create a promise that will be
 * resolved or rejected from outside the promise executor function.
 *
 * @public
 */
export interface Deferred<T> {
	/** The underlying promise that can be awaited */
	promise: Promise<T>;
	/** Function to resolve the promise with a value */
	resolve: (value: T) => void;
	/** Function to reject the promise with an error */
	reject: (error: Error) => void;
}

/**
 * Creates a deferred promise with externally accessible resolve and reject functions.
 *
 * @typeParam T - The type of value the promise will resolve to
 * @returns A {@link Deferred} object containing the promise and its control functions
 *
 * @remarks
 * This utility is helpful when the resolution of a promise depends on external
 * events or callbacks that occur outside the promise executor scope.
 *
 * @example
 * ```typescript
 * const deferred = createDeferred<string>();
 *
 * // Pass the promise to something that will await it
 * someAsyncOperation(deferred.promise);
 *
 * // Later, resolve from elsewhere
 * deferred.resolve('Success!');
 * ```
 *
 * @public
 */
export function createDeferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void;
	let reject!: (error: Error) => void;

	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});

	return { promise, resolve, reject };
}

/**
 * Wraps a promise with a timeout, rejecting if the timeout is exceeded.
 *
 * @typeParam T - The type of value the promise will resolve to
 * @param promise - The promise to wrap with a timeout
 * @param ms - The timeout duration in milliseconds
 * @param message - Custom error message for timeout (defaults to 'Operation timed out')
 * @returns A new promise that resolves with the original value or rejects on timeout
 *
 * @throws Error when the timeout is exceeded before the promise resolves
 *
 * @remarks
 * This is useful for adding time constraints to operations that might hang
 * or take unexpectedly long. The original promise continues executing even
 * after timeout, but its result is ignored.
 *
 * @example
 * ```typescript
 * try {
 *   const result = await promiseTimeout(
 *     fetchData(),
 *     5000,
 *     'Data fetch timed out'
 *   );
 * } catch (error) {
 *   console.error(error.message); // "Data fetch timed out (5000ms)"
 * }
 * ```
 *
 * @public
 */
export function promiseTimeout<T>(
	promise: Promise<T>,
	ms: number,
	message = "Operation timed out",
): Promise<T> {
	return new Promise((resolve, reject) => {
		const timeoutId = setTimeout(() => {
			reject(new Error(`${message} (${ms}ms)`));
		}, ms);

		promise
			.then((value) => {
				clearTimeout(timeoutId);
				resolve(value);
			})
			.catch((error) => {
				clearTimeout(timeoutId);
				reject(error);
			});
	});
}
