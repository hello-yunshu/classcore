// GENERATED FILE. Edit config/private-identity-policy.json and run npm run policy:generate.
export const PRIVATE_IDENTITY_FIELD_NAMES = [
  "participantId",
  "studentId",
  "membershipId",
  "connectionId",
  "rosterId",
  "displayName",
  "realName",
  "studentName",
  "seatNo",
  "classId",
  "deviceId",
  "clientInstanceId",
  "participantHint",
  "reconnectToken",
  "accessToken",
  "credential"
] as const;
export const PRIVATE_PARTICIPANT_REFERENCE_PREFIXES = [
  "student:",
  "teacher:",
  "observer:",
  "display:",
  "membership:",
  "connection:",
  "roster:",
  "class:"
] as const;
const PRIVATE_IDENTITY_FIELD_SET = new Set<string>(PRIVATE_IDENTITY_FIELD_NAMES);
const PRIVATE_REFERENCE_PATTERN = new RegExp(`(?:${PRIVATE_PARTICIPANT_REFERENCE_PREFIXES.map((prefix) => prefix.slice(0, -1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}):[A-Za-z0-9][A-Za-z0-9._:-]*`, 'i');
export function isPrivateIdentityFieldName(key: string): boolean { return PRIVATE_IDENTITY_FIELD_SET.has(key); }
function decodeIdentityLayer(input: string): string {
  let out = input.replace(/&amp;/gi, '&').replace(/&colon;/gi, ':').replace(/&#0*58;/gi, ':').replace(/&#x0*3a;/gi, ':')
    .replace(/\\u([0-9a-f]{4})/gi, (_m, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/\\x([0-9a-f]{2})/gi, (_m, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));
  try { out = decodeURIComponent(out); } catch { }
  return out;
}
export function identityTextVariants(value: string, maxLayers = 5): string[] {
  const variants = [value]; let current = value;
  for (let i = 0; i < maxLayers; i++) { const next = decodeIdentityLayer(current); if (next === current || variants.includes(next)) break; variants.push(next); current = next; }
  return variants;
}
export function isPrivateParticipantReference(value: string): boolean { return identityTextVariants(value).some((candidate) => PRIVATE_REFERENCE_PATTERN.test(candidate)); }
export interface PrivateIdentityViolation { kind: 'field' | 'reference'; path: string; value: string; }
export function findPrivateIdentityViolations(value: unknown, path = '$'): PrivateIdentityViolation[] {
  const out: PrivateIdentityViolation[] = [];
  const visit = (current: unknown, currentPath: string): void => {
    if (typeof current === 'string') { if (isPrivateParticipantReference(current)) out.push({ kind: 'reference', path: currentPath, value: current }); return; }
    if (Array.isArray(current)) { current.forEach((item, index) => visit(item, `${currentPath}[${index}]`)); return; }
    if (!current || typeof current !== 'object') return;
    for (const [key, item] of Object.entries(current as Record<string, unknown>)) {
      const childPath = `${currentPath}.${key}`;
      if (isPrivateIdentityFieldName(key)) out.push({ kind: 'field', path: childPath, value: key });
      if (isPrivateParticipantReference(key)) out.push({ kind: 'reference', path: childPath, value: key });
      visit(item, childPath);
    }
  };
  visit(value, path); return out;
}
