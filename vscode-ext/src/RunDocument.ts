/** A cancelled/failed save must never launch stale disk contents. */
export async function saveAndRunDocument(
  document: { isDirty: boolean; save(): PromiseLike<boolean> },
  launch: () => PromiseLike<unknown>,
): Promise<boolean> {
  if (document.isDirty && !(await document.save())) return false;
  await launch();
  return true;
}
