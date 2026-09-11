import { runPython, projectRoot } from './lib/python-runtime.mjs';
const result = runPython(['scripts/validate-jsonschema.py'], { cwd: projectRoot });
if (result.stdout)
    process.stdout.write(result.stdout);
if (result.stderr)
    process.stderr.write(result.stderr);
process.exit(result.status ?? 1);

