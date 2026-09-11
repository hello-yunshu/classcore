import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { renderIntegrity } from '../scripts/lib/package-integrity.mjs';
test('package integrity is exact-set and changes when release content changes', () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'integrity-')); try { fs.writeFileSync(path.join(root,'a.txt'),'a'); const a=renderIntegrity(root); fs.writeFileSync(path.join(root,'b.txt'),'b'); const b=renderIntegrity(root); assert.notEqual(a,b); assert.match(b,/a\.txt/); assert.match(b,/b\.txt/); } finally { fs.rmSync(root,{recursive:true,force:true}); }
});
