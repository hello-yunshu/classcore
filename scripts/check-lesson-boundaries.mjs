import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, '..');
const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.ts', '.tsx']);
const IGNORED_DIRECTORIES = new Set(['.git', 'dist', 'node_modules', '.venv']);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function relative(root, file) {
  return path.relative(root, file).split(path.sep).join('/');
}

function sourceFiles(directory) {
  const files = [];
  if (!fs.existsSync(directory)) return files;
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(absolute);
    }
  };
  visit(directory);
  return files.sort((a, b) => a.localeCompare(b));
}

function configuredFiles(root, directories) {
  return directories.flatMap((directory) => sourceFiles(path.join(root, directory)));
}

function lineNumber(text, offset) {
  return text.slice(0, offset).split('\n').length;
}

function extractImports(text) {
  const imports = [];
  const patterns = [
    /\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) imports.push({ specifier: match[1], index: match.index ?? 0 });
  }
  return imports;
}

function normalized(value) {
  return value.toLowerCase().replaceAll('\\', '/');
}

function isLessonSpecifier(specifier, registry) {
  const value = normalized(specifier);
  if (value.split('/').includes('lessons')) return true;
  if (value.includes('/examples/') || value.startsWith('examples/')) return registry.lessonPathTokens.some((token) => value.includes(normalized(token)));
  return registry.lessonPathTokens.some((token) => value.includes(normalized(token))) || value.includes('@classroom/lesson-');
}

function isIgnoredForMockGate(file) {
  const value = normalized(file);
  return value.includes('/tests/') || value.includes('/fixtures/') || value.includes('/examples/') || value.includes('/reference/');
}

function addMatch(errors, root, file, text, match, message) {
  errors.push(`${relative(root, file)}:${lineNumber(text, match.index ?? 0)}: ${message}`);
}

function checkImportDirection(root, files, registry, errors) {
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const imported of extractImports(text)) {
      if (isLessonSpecifier(imported.specifier, registry)) {
        addMatch(errors, root, file, text, imported, `Core must not import lesson source: ${imported.specifier}`);
      }
    }
    for (const lessonId of registry.lessonIds) {
      const index = text.indexOf(lessonId);
      if (index !== -1) addMatch(errors, root, file, text, { index }, `Core source contains registered lesson namespace: ${lessonId}`);
    }
  }
}

function checkGenericSurfaceImports(root, files, registry, errors) {
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
        for (const imported of extractImports(text)) {
            if (isLessonSpecifier(imported.specifier, registry)) {
                addMatch(errors, root, file, text, imported, `generic surface must not import lesson implementation: ${imported.specifier}`);
            }
        }
        for (const token of [...(registry.lessonPathTokens ?? []), ...(registry.lessonDisplayNames ?? [])]) {
            const index = text.indexOf(token);
            if (index !== -1) addMatch(errors, root, file, text, { index }, `generic surface contains registered lesson-specific token: ${token}`);
        }
    }
}

function checkProductionMocks(root, files, errors) {
  const rules = [
    { pattern: /\bnew\s+BroadcastChannel\s*\(/g, message: 'production classroom path must use the server transport, not BroadcastChannel' },
    { pattern: /\b(?:fake[-_ ]?qr|qr[-_ ]?placeholder|fakeQr)\b/gi, message: 'production classroom path must not contain a fake QR marker' },
    { pattern: /\b(?:demoMetrics|mockMetrics|fixedMetrics|hardcodedMetrics|hardCodedMetrics)\s*[:=]/g, message: 'production classroom path must not ship fixed AI demo metrics' },
    { pattern: /\b(?:recommendedStudent(?:Id|ID)|recommendationStudent(?:Id|ID))\s*[:=]\s*['"`]?\d+/g, message: 'production classroom path must not hard-code a recommended student id' },
    { pattern: /\b(?:recommendedStudent(?:Ids|IDs)|recommendationStudent(?:Ids|IDs))\s*[:=]\s*\[[^\]]*['"`]?\d+/g, message: 'production classroom path must not hard-code recommended student ids' },
    { pattern: /\b(?:credentialValue|credential)\s*[:=]\s*['"`][^'"`]+['"`]/g, message: 'production classroom path must not hard-code classroom credentials; inject them through the authenticated session configuration' },
    { pattern: /\b(?:participantId|userId)\s*[:=]\s*['"`](?:student|teacher|display|observer):[^'"`]+['"`]/g, message: 'production classroom path must not hard-code classroom participant identities' },
    { pattern: /\b(?:const|let)\s+(?:students|studentRoster|roster)\s*=\s*\[[\s\S]{0,800}?\b(?:studentId|participantId|seatNo|id)\s*:\s*['"`][^'"`]+['"`]/g, message: 'production classroom path must obtain students from the authoritative roster, not a fixed array' },
  ];
  for (const file of files) {
    if (isIgnoredForMockGate(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const rule of rules) {
      for (const match of text.matchAll(rule.pattern)) addMatch(errors, root, file, text, match, rule.message);
    }
  }
}

export function checkLessonBoundaries(root = DEFAULT_ROOT) {
  const absoluteRoot = path.resolve(root);
  const registry = readJson(path.join(absoluteRoot, 'config/lesson-boundaries.json'));
  const errors = [];
  const coreFiles = configuredFiles(absoluteRoot, registry.coreRoots);
  const surfaceFiles = configuredFiles(absoluteRoot, registry.genericSurfaceRoots);
  const productionFiles = configuredFiles(absoluteRoot, registry.productionRoots);

  checkImportDirection(absoluteRoot, coreFiles, registry, errors);
  checkGenericSurfaceImports(absoluteRoot, surfaceFiles, registry, errors);
  checkProductionMocks(absoluteRoot, productionFiles, errors);

  return {
    errors: [...new Set(errors)],
    stats: { coreFiles: coreFiles.length, genericSurfaceFiles: surfaceFiles.length, productionFiles: productionFiles.length },
  };
}

function parseRoot(argv) {
  const index = argv.indexOf('--root');
  return index === -1 ? DEFAULT_ROOT : path.resolve(argv[index + 1] ?? '');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const result = checkLessonBoundaries(parseRoot(process.argv.slice(2)));
  if (result.errors.length) {
    console.error('Lesson boundary check FAILED');
    result.errors.forEach((error) => console.error(` - ${error}`));
    process.exit(1);
  }
  console.log(`Lesson boundary check PASSED: ${result.stats.coreFiles} Core files, ${result.stats.genericSurfaceFiles} generic Surface files, ${result.stats.productionFiles} production files`);
}
