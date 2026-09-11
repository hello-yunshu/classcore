import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateLessonPackageDirectory } from '../scripts/lib/lesson-package-validator.mjs';

const root = process.cwd();
const fixture = path.join(root, 'examples', 'pattern-restoration');

function withFixture(mutator) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lesson-semantic-negative-'));
  const target = path.join(tmp, 'lesson');
  fs.cpSync(fixture, target, { recursive: true });
  try {
    mutator(target);
    return validateLessonPackageDirectory(target);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function read(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function write(file, value) { fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); }

test('generic lesson gate rejects missing lazy/non-preload assets', () => {
  const result = withFixture((target) => {
    const file = path.join(target, 'lesson.json');
    const lesson = read(file);
    lesson.assets.push({ assetId: 'asset:missing-lazy', path: 'assets/does-not-exist.png', mimeType: 'image/png', preload: false });
    write(file, lesson);
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /asset:missing-lazy.*file missing/);
});

test('generic lesson gate rejects required capabilities absent from applet manifest', () => {
  const result = withFixture((target) => {
    const file = path.join(target, 'activities.json');
    const activities = read(file);
    activities[1].applets[0].requiredCapabilities.push('cap:does-not-exist');
    write(file, activities);
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /missing capability cap:does-not-exist/);
});

test('generic lesson gate rejects applets declaring server-owned events', () => {
  const result = withFixture((target) => {
    const file = path.join(target, 'applets.manifest.json');
    const applets = read(file);
    const applet = applets[0];
    applet.emittedEventTypes.push('session.started');
    applet.eventSchemaRefs['session.started'] = applet.eventSchemaRefs['object.selected'];
    write(file, applets);
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /server-owned event session\.started/);
});

test('generic lesson gate rejects presentation stage references to unknown scenes', () => {
  const result = withFixture((target) => {
    const file = path.join(target, 'activities.json');
    const activities = read(file);
    activities[0].stagePolicy.sceneId = 'scene:not-real';
    write(file, activities);
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /unknown presentation scene scene:not-real/);
});

test('generic lesson gate rejects presentation deck mismatch and disabled runtime', () => {
  const result = withFixture((target) => {
    const activitiesFile = path.join(target, 'activities.json');
    const activities = read(activitiesFile);
    activities[0].stagePolicy.deckId = 'deck:not-real';
    write(activitiesFile, activities);
    const featureFile = path.join(target, 'feature-policy.example.json');
    const policy = read(featureFile);
    policy.features.presentationRuntime = false;
    write(featureFile, policy);
  });
  assert.equal(result.valid, false);
  const errors = result.errors.join('\n');
  assert.match(errors, /deckId does not match/);
  assert.match(errors, /presentationRuntime feature=true/);
});

test('generic lesson gate rejects package path traversal', () => {
  const result = withFixture((target) => {
    const file = path.join(target, 'package.manifest.json');
    const manifest = read(file);
    manifest.lessonRef = '../outside.json';
    write(file, manifest);
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /path escapes lesson package/);
});

test('generic lesson gate rejects identity-specific presentation binding parameters', () => {
  const result = withFixture((target) => {
    const file = path.join(target, 'presentation.example.json');
    const presentation = read(file);
    presentation.classroomBindings[0].source.parameters.participantId = 'student:S17';
    write(file, presentation);
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /identity-specific binding field .*participantId/);
});

test('generic lesson gate rejects duplicate presentation scene ids', () => {
  const result = withFixture((target) => {
    const file = path.join(target, 'presentation.example.json');
    const presentation = read(file);
    presentation.document.scenes[1].id = presentation.document.scenes[0].id;
    write(file, presentation);
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /duplicate scene id scene:intro/);
});

test('generic lesson gate rejects symlink asset escape', (t) => {
  if (process.platform === 'win32') {
    t.skip('symlink creation is not reliably available on Windows developer hosts');
    return;
  }
  const result = withFixture((target) => {
    const outside = path.join(path.dirname(target), 'outside.txt');
    fs.writeFileSync(outside, 'outside lesson package\n');
    const link = path.join(target, 'assets', 'escape.txt');
    fs.symlinkSync(outside, link);

    const file = path.join(target, 'lesson.json');
    const lesson = read(file);
    lesson.assets.push({ assetId: 'asset:symlink-escape', path: 'assets/escape.txt', mimeType: 'text/plain', preload: false });
    write(file, lesson);
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /asset asset:symlink-escape: path escapes lesson package/);
});

test('generic lesson gate rejects seat/class/membership identity fields from presentation bindings', () => {
  for (const [field, value] of [['seatNo','17'], ['classId','5-5'], ['membershipId','membership:S17'], ['connectionId','connection:abc']]) {
    const result = withFixture((target) => {
      const file = path.join(target, 'presentation.example.json');
      const presentation = read(file);
      presentation.classroomBindings[0].source.parameters[field] = value;
      write(file, presentation);
    });
    assert.equal(result.valid, false, field);
    assert.match(result.errors.join('\n'), new RegExp(`identity-specific binding field .*${field}`));
  }
});

test('generic lesson gate rejects identity references in arrays, object keys, roster refs and class refs', () => {
  const mutations = [
    (parameters) => { parameters.targets = ['student:S17']; },
    (parameters) => { parameters.byStudent = { 'student:S17': { score: 1 } }; },
    (parameters) => { parameters.targetRoster = 'roster:17'; },
    (parameters) => { parameters.targetClass = 'class:5-5'; },
  ];
  for (const mutate of mutations) {
    const result = withFixture((target) => {
      const file = path.join(target, 'presentation.example.json');
      const presentation = read(file);
      mutate(presentation.classroomBindings[0].source.parameters);
      write(file, presentation);
    });
    assert.equal(result.valid, false);
    assert.match(result.errors.join('\n'), /identity-specific binding reference/);
  }
});

test('generic lesson gate rejects identity references outside binding parameters', () => {
  const mutations = [
    (binding) => { binding.bindingId = 'student:S17'; },
    (binding) => { binding.source.selector = 'student:S17'; },
    (binding) => { binding.fallback = { type: 'static-text', text: 'roster:17' }; },
  ];
  for (const mutate of mutations) {
    const result = withFixture((target) => {
      const file = path.join(target, 'presentation.example.json');
      const presentation = read(file);
      mutate(presentation.classroomBindings[0]);
      write(file, presentation);
    });
    assert.equal(result.valid, false);
    assert.match(result.errors.join('\n'), /identity-specific binding reference/);
  }
});


test('generic lesson gate rejects embedded and multiply encoded identity references in presentation text', () => {
  for (const leaked of ['selected student:S17','https://local/?id=student%3AS17','student%253AS17','student&amp;#58;S17','student%255Cu003AS17']) {
    const result = withFixture((target) => {
      const file = path.join(target, 'presentation.example.json');
      const presentation = read(file);
      presentation.classroomBindings[0].source.parameters.debugLabel = leaked;
      write(file, presentation);
    });
    assert.equal(result.valid, false, leaked);
    assert.match(result.errors.join('\n'), /identity-specific binding reference/);
  }
});
