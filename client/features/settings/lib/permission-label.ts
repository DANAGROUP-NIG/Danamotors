const CSI_PERMISSION_LABELS: Record<string, string> = {
  "csi:master:read": "View CSI masters",
  "csi:master:update": "Manage CSI masters",
  "csi:card:generate": "Generate and print CSI questionnaires",
  "csi:response:read": "View CSI responses",
  "csi:response:update": "Record and correct CSI responses",
  "report:csi": "Customer satisfaction report",
  "report:csi-attribute": "CSI attribute report",
  "report:csi-checklist": "CSI checklist report",
};

export function getPermissionLabel(name: string): string {
  if (CSI_PERMISSION_LABELS[name]) return CSI_PERMISSION_LABELS[name];
  const action = name.split(":").slice(1).join(" ") || name;
  return action
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
