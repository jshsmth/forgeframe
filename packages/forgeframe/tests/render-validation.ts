/**
 * Runs the schema and component `validate` checks that render admission
 * performs, without opening a host.
 */
export function checkRenderValidation(instance: unknown): void {
	(instance as { validateForRender(): void }).validateForRender();
}
