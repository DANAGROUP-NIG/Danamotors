const JOB_CARD_SECTION_ROLES = {
  workshop: ["workshopmanager", "generalworkshopmanager", "technician"],
  finance: ["billingofficer", "serviceadviser"],
} as const;

export function canViewJobCardSection(
  roles: readonly (string | undefined)[],
  section: keyof typeof JOB_CARD_SECTION_ROLES,
): boolean {
  const allowed: readonly string[] = JOB_CARD_SECTION_ROLES[section];
  return roles.some((role) => {
    const normalized = role?.toLowerCase().replace(/[\s-]/g, "_") ?? "";
    return normalized === "admin" || normalized === "superadmin" || allowed.includes(normalized);
  });
}
