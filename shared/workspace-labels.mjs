// Presentation only: legacy inbox identities and on-disk names remain untouched.
export function projectLabel(project) {
  return project?.publicInbox ? "待整理" : project?.name || "";
}
