/**
 * A function that performs cleanup, optionally returning a Promise for async cleanup.
 * @internal
 */
type CleanupTask = () => void | Promise<void>;

/**
 * Manages cleanup tasks for proper resource disposal in a LIFO (Last-In-First-Out) order.
 *
 * @remarks
 * The CleanupManager provides a centralized way to register and execute cleanup tasks,
 * ensuring resources are properly disposed of when components or processes are torn down.
 * Tasks are executed in reverse registration order (LIFO), which is appropriate for
 * nested resource allocation patterns.
 *
 * @example
 * ```typescript
 * const cleanup = new CleanupManager();
 *
 * // Register cleanup tasks
 * cleanup.register(() => console.log('First registered, last executed'));
 * cleanup.register(() => console.log('Last registered, first executed'));
 *
 * // Execute all cleanup tasks
 * await cleanup.cleanup();
 * ```
 *
 * @public
 */
export class CleanupManager {
  /**
   * Array of registered cleanup tasks awaiting execution.
   * @internal
   */
  private tasks: CleanupTask[] = [];

  /**
   * Flag indicating whether cleanup has already been performed.
   * @internal
   */
  private cleaned = false;

  /**
   * Registers a cleanup task to be executed when {@link cleanup} is called.
   *
   * @param task - The cleanup function to register
   *
   * @remarks
   * If cleanup has already been performed, the task is scheduled on a microtask
   * and executed asynchronously rather than being registered. This ensures
   * late-registered tasks are still handled appropriately while safely capturing
   * both sync and async task failures.
   *
   * @example
   * ```typescript
   * cleanup.register(() => {
   *   eventEmitter.removeAllListeners();
   * });
   *
   * cleanup.register(async () => {
   *   await database.close();
   * });
   * ```
   *
   * @public
   */
  register(task: CleanupTask): void {
    if (this.cleaned) {
      void Promise.resolve()
        .then(() => task())
        .catch((err) => {
          console.error('Error in cleanup task:', err);
        });
      return;
    }
    this.tasks.push(task);
  }

  /**
   * Executes all registered cleanup tasks in LIFO order.
   *
   * @returns A Promise that resolves when all cleanup tasks have completed
   *
   * @remarks
   * Tasks are executed in reverse order of registration (LIFO pattern).
   * Each task is awaited individually, and errors are caught and logged
   * to prevent one failing task from blocking subsequent cleanup operations.
   * Calling this method multiple times has no effect after the first call.
   *
   * @example
   * ```typescript
   * // In a component's destroy lifecycle
   * async destroy() {
   *   await this.cleanupManager.cleanup();
   * }
   * ```
   *
   * @public
   */
  async cleanup(): Promise<void> {
    if (this.cleaned) return;
    this.cleaned = true;

    const tasks = this.tasks.reverse();
    this.tasks = [];

    for (const task of tasks) {
      try {
        await task();
      } catch (err) {
        console.error('Error in cleanup task:', err);
      }
    }
  }

  /**
   * Checks whether cleanup has already been performed.
   *
   * @returns `true` if {@link cleanup} has been called, `false` otherwise
   *
   * @example
   * ```typescript
   * if (!cleanupManager.isCleaned()) {
   *   // Safe to register more tasks
   *   cleanupManager.register(myTask);
   * }
   * ```
   *
   * @public
   */
  isCleaned(): boolean {
    return this.cleaned;
  }

  /**
   * Resets the manager to its initial state, allowing it to be reused.
   *
   * @remarks
   * This method clears all registered tasks and resets the cleaned flag.
   * It is primarily intended for testing scenarios or cases where the
   * manager needs to be reused after cleanup.
   *
   * @example
   * ```typescript
   * // In a test teardown
   * afterEach(() => {
   *   cleanupManager.reset();
   * });
   * ```
   *
   * @public
   */
  reset(): void {
    this.tasks = [];
    this.cleaned = false;
  }
}
