import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const policy = JSON.parse(fs.readFileSync(path.join(root, 'config/private-identity-policy.json'), 'utf8'));
export const PRIVATE_IDENTITY_FIELD_NAMES = Object.freeze([...policy.privateFieldNames]);
export const PRIVATE_PARTICIPANT_REFERENCE_PREFIXES = Object.freeze([...policy.participantReferencePrefixes]);
const fields = new Set(PRIVATE_IDENTITY_FIELD_NAMES);
const prefixAlternation = PRIVATE_PARTICIPANT_REFERENCE_PREFIXES.map((prefix) => prefix.slice(0, -1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
const privateReferencePattern = new RegExp(`(?:${prefixAlternation}):[A-Za-z0-9][A-Za-z0-9._:-]*`, 'i');
export const isPrivateIdentityFieldName = (key) => fields.has(key);
function decodeIdentityLayer(input) {
  let out = input;
  out = out.replace(/&amp;/gi, '&')
    .replace(/&colon;/gi, ':')
    .replace(/&#0*58;/gi, ':')
    .replace(/&#x0*3a;/gi, ':')
    .replace(/\\u([0-9a-f]{4})/gi, (_m, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/\\x([0-9a-f]{2})/gi, (_m, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
  try { out = decodeURIComponent(out); } catch { /* malformed percent sequence: keep current form */ }
  return out;
}
export function identityTextVariants(value, maxLayers = 5) {
  if (typeof value !== 'string') return [];
  const variants = [value];
  let current = value;
  for (let i = 0; i < maxLayers; i++) {
    const next = decodeIdentityLayer(current);
    if (next === current || variants.includes(next)) break;
    variants.push(next);
    current = next;
  }
  return variants;
}
export const isPrivateParticipantReference = (value) => typeof value === 'string' && identityTextVariants(value).some((candidate) => privateReferencePattern.test(candidate));
export function findPrivateIdentityViolations(value, pathLabel = '$') {
  const out = [];
  const visit = (current, currentPath) => {
    if (typeof current === 'string') {
      if (isPrivateParticipantReference(current)) out.push({ kind: 'reference', path: currentPath, value: current });
      return;
    }
    if (Array.isArray(current)) {
      current.forEach((item, index) => visit(item, `${currentPath}[${index}]`));
      return;
    }
    if (!current || typeof current !== 'object') return;
    for (const [key, item] of Object.entries(current)) {
      const childPath = `${currentPath}.${key}`;
      if (isPrivateIdentityFieldName(key)) out.push({ kind: 'field', path: childPath, value: key });
      if (isPrivateParticipantReference(key)) out.push({ kind: 'reference', path: childPath, value: key });
      visit(item, childPath);
    }
  };
  visit(value, pathLabel);
  return out;
}
