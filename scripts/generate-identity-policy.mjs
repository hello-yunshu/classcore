import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configFile = path.join(root, 'config/private-identity-policy.json');
const outputFile = path.join(root, 'packages/contracts/src/private-identity-policy.generated.ts');
const policy = JSON.parse(fs.readFileSync(configFile, 'utf8'));

function assertPolicy(value) {
  if (value?.schemaVersion !== 1) throw new Error('private identity policy schemaVersion must be 1');
  for (const key of ['privateFieldNames', 'participantReferencePrefixes']) {
    if (!Array.isArray(value[key]) || value[key].length === 0 || value[key].some((item) => typeof item !== 'string' || !item)) {
      throw new Error(`${key} must be a non-empty string array`);
    }
    if (new Set(value[key]).size !== value[key].length) throw new Error(`${key} contains duplicates`);
  }
}

export function renderIdentityPolicySource(value = policy) {
  assertPolicy(value);
  const fields = JSON.stringify(value.privateFieldNames, null, 2);
  const prefixes = JSON.stringify(value.participantReferencePrefixes, null, 2);
  return `// GENERATED FILE. Edit config/private-identity-policy.json and run npm run policy:generate.\n` +
`export const PRIVATE_IDENTITY_FIELD_NAMES = ${fields} as const;\n` +
`export const PRIVATE_PARTICIPANT_REFERENCE_PREFIXES = ${prefixes} as const;\n` +
`const PRIVATE_IDENTITY_FIELD_SET = new Set<string>(PRIVATE_IDENTITY_FIELD_NAMES);\n` +
`const PRIVATE_REFERENCE_PATTERN = new RegExp(\`(?:${'${PRIVATE_PARTICIPANT_REFERENCE_PREFIXES.map((prefix) => prefix.slice(0, -1).replace(/[.*+?^${}()|[\\]\\\\]/g, \'\\\\$&\')).join(\'|\')}'}):[A-Za-z0-9][A-Za-z0-9._:-]*\`, 'i');\n` +
`export function isPrivateIdentityFieldName(key: string): boolean { return PRIVATE_IDENTITY_FIELD_SET.has(key); }\n` +
`function decodeIdentityLayer(input: string): string {\n` +
`  let out = input.replace(/&amp;/gi, '&').replace(/&colon;/gi, ':').replace(/&#0*58;/gi, ':').replace(/&#x0*3a;/gi, ':')\n` +
`    .replace(/\\\\u([0-9a-f]{4})/gi, (_m, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))\n` +
`    .replace(/\\\\x([0-9a-f]{2})/gi, (_m, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));\n` +
`  try { out = decodeURIComponent(out); } catch { }\n` +
`  return out;\n` +
`}\n` +
`export function identityTextVariants(value: string, maxLayers = 5): string[] {\n` +
`  const variants = [value]; let current = value;\n` +
`  for (let i = 0; i < maxLayers; i++) { const next = decodeIdentityLayer(current); if (next === current || variants.includes(next)) break; variants.push(next); current = next; }\n` +
`  return variants;\n` +
`}\n` +
`export function isPrivateParticipantReference(value: string): boolean { return identityTextVariants(value).some((candidate) => PRIVATE_REFERENCE_PATTERN.test(candidate)); }\n` +
`export interface PrivateIdentityViolation { kind: 'field' | 'reference'; path: string; value: string; }\n` +
`export function findPrivateIdentityViolations(value: unknown, path = '$'): PrivateIdentityViolation[] {\n` +
`  const out: PrivateIdentityViolation[] = [];\n` +
`  const visit = (current: unknown, currentPath: string): void => {\n` +
`    if (typeof current === 'string') { if (isPrivateParticipantReference(current)) out.push({ kind: 'reference', path: currentPath, value: current }); return; }\n` +
`    if (Array.isArray(current)) { current.forEach((item, index) => visit(item, \`${'${currentPath}'}[${'${index}'}]\`)); return; }\n` +
`    if (!current || typeof current !== 'object') return;\n` +
`    for (const [key, item] of Object.entries(current as Record<string, unknown>)) {\n` +
`      const childPath = \`${'${currentPath}'}.${'${key}'}\`;\n` +
`      if (isPrivateIdentityFieldName(key)) out.push({ kind: 'field', path: childPath, value: key });\n` +
`      if (isPrivateParticipantReference(key)) out.push({ kind: 'reference', path: childPath, value: key });\n` +
`      visit(item, childPath);\n` +
`    }\n` +
`  };\n` +
`  visit(value, path); return out;\n` +
`}\n`;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const source = renderIdentityPolicySource();
  fs.writeFileSync(outputFile, source);
  console.log(`Identity policy generated: ${path.relative(root, outputFile)}`);
}
