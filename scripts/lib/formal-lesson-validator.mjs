import path from 'node:path';
import { runPython, projectRoot } from './python-runtime.mjs';
export function validateLessonPackageWithFormalSchemas(directory) {
    const absolute = path.resolve(directory);
    const result = runPython(['scripts/validate-lesson-schema.py', absolute], { cwd: projectRoot });
    return {
        valid: result.status === 0,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
        status: result.status ?? 1,
    };
}

