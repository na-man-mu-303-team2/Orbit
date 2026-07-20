/**
 * Fixed IDs of the retired `kdh@orbit.com` home fixture.
 *
 * The seeder is gone, but the rows survive in each deployed database until
 * `scripts/cleanup-kdh-home-projects.ts` is run by hand. These IDs are
 * guessable, so the access guards below stay in place for that window --
 * without them a logged-in stranger could request access to a fixture project
 * and read its metadata.
 *
 * Delete this module, its guards in `ProjectsService`, and the import in the
 * cleanup script once the cleanup has run everywhere.
 */
export const kdhHomeProjectIds = Array.from(
  { length: 10 },
  (_, index) => `project_kdh_home_${String(index + 1).padStart(2, "0")}`,
);

export function isKdhHomeProjectId(projectId: string): boolean {
  return kdhHomeProjectIds.includes(projectId);
}
