import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { findPrivateIdentityViolations } from './identity-policy.mjs';

const SERVER_OWNED_EVENT_PREFIXES = [
  'session.',
  'activity.',
  'stage.',
  'submission.',
  'advice.',
  'controller.',
  'system.',
];

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveInside(base, ref) {
  if (typeof ref !== 'string' || !ref) return null;
  const root = path.resolve(base);
  const candidate = path.resolve(root, ref);
  if (!isInside(root, candidate)) return null;

  // Lexical containment is not enough when a Lesson Package contains symlinks.
  // For existing targets, resolve the real path and keep it inside the real package root.
  if (fs.existsSync(candidate)) {
    try {
      const realRoot = fs.realpathSync.native(root);
      const realCandidate = fs.realpathSync.native(candidate);
      if (!isInside(realRoot, realCandidate)) return null;
    } catch {
      return null;
    }
  }
  return candidate;
}

function validateIdentityNeutralValue(value, label, errors, pathLabel = '$') {
  for (const violation of findPrivateIdentityViolations(value, pathLabel)) {
    if (violation.kind === 'field') errors.push(`${label}: identity-specific binding field ${violation.path}`);
    else errors.push(`${label}: identity-specific binding reference ${violation.path}`);
  }
}

function loadReferencedJson(base, ref, label, errors) {
  const file = resolveInside(base, ref);
  if (!file) {
    errors.push(`${label}: path escapes lesson package: ${String(ref)}`);
    return undefined;
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    errors.push(`${label}: missing referenced file: ${ref}`);
    return undefined;
  }
  try {
    return readJson(file);
  } catch (error) {
    errors.push(`${label}: invalid JSON ${ref}: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

function validateAssetFiles(base, lesson, errors) {
  const assetIds = new Set();
  for (const asset of Array.isArray(lesson?.assets) ? lesson.assets : []) {
    if (!isObject(asset)) continue;
    const id = asset.assetId ?? 'asset?';
    if (typeof asset.assetId === 'string') {
      if (assetIds.has(asset.assetId)) errors.push(`duplicate assetId ${asset.assetId}`);
      assetIds.add(asset.assetId);
    }
    const file = resolveInside(base, asset.path);
    if (!file) {
      errors.push(`asset ${id}: path escapes lesson package: ${String(asset.path)}`);
      continue;
    }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      errors.push(`asset ${id}: file missing: ${String(asset.path)}`);
      continue;
    }
    const bytes = fs.readFileSync(file);
    if (asset.size !== null && asset.size !== undefined && asset.size !== bytes.length) {
      errors.push(`asset ${id}: size mismatch ${bytes.length} != ${asset.size}`);
    }
    if (typeof asset.sha256 === 'string') {
      const actual = crypto.createHash('sha256').update(bytes).digest('hex');
      if (actual !== asset.sha256) errors.push(`asset ${id}: sha256 mismatch`);
    }
    if (asset.preload === true) {
      if (!Number.isInteger(asset.size) || asset.size < 0) errors.push(`asset ${id}: preload requires integer size`);
      if (typeof asset.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(asset.sha256)) {
        errors.push(`asset ${id}: preload requires sha256`);
      }
    }
  }
}

function validatePresentation(base, manifest, activities, errors) {
  const optionalRefs = isObject(manifest.optionalRefs) ? manifest.optionalRefs : {};
  let presentation;
  let featurePolicy;

  if (optionalRefs.presentationAsset) {
    presentation = loadReferencedJson(base, optionalRefs.presentationAsset, 'optionalRef presentationAsset', errors);
  }
  if (optionalRefs.featurePolicy) {
    featurePolicy = loadReferencedJson(base, optionalRefs.featurePolicy, 'optionalRef featurePolicy', errors);
  }

  if (presentation && isObject(presentation)) {
    const bindingIds = new Set();
    for (const binding of Array.isArray(presentation.classroomBindings) ? presentation.classroomBindings : []) {
      if (!isObject(binding) || typeof binding.bindingId !== 'string') continue;
      if (bindingIds.has(binding.bindingId)) errors.push(`presentation duplicate bindingId ${binding.bindingId}`);
      bindingIds.add(binding.bindingId);
      validateIdentityNeutralValue(binding, `presentation binding ${binding.bindingId}`, errors);
    }

    if (Array.isArray(presentation?.document?.scenes)) {
      const seenSceneIds = new Set();
      for (const scene of presentation.document.scenes) {
        const sceneId = scene?.id;
        if (typeof sceneId !== 'string' || !sceneId) continue;
        if (seenSceneIds.has(sceneId)) errors.push(`presentation duplicate scene id ${sceneId}`);
        seenSceneIds.add(sceneId);
      }
    }
  }

  const presentationActivities = (Array.isArray(activities) ? activities : [])
    .filter((activity) => activity?.stagePolicy?.contentType === 'presentation:deck');
  if (!presentationActivities.length) return;

  if (!presentation) {
    for (const activity of presentationActivities) {
      errors.push(`${activity.activityId}: presentation Stage policy requires optionalRefs.presentationAsset`);
    }
    return;
  }

  const sceneIds = new Set(
    Array.isArray(presentation?.document?.scenes)
      ? presentation.document.scenes.map((scene) => scene?.id).filter((id) => typeof id === 'string' && id)
      : [],
  );
  for (const activity of presentationActivities) {
    const policy = activity.stagePolicy;
    if (policy.deckId !== presentation.deckId) {
      errors.push(`${activity.activityId}: stagePolicy deckId does not match presentation asset`);
    }
    if (typeof policy.sceneId === 'string' && policy.sceneId && !sceneIds.has(policy.sceneId)) {
      errors.push(`${activity.activityId}: unknown presentation scene ${policy.sceneId}`);
    }
  }
  if (featurePolicy?.features?.presentationRuntime !== true) {
    errors.push('presentation Stage policy requires presentationRuntime feature=true');
  }
}

/**
 * Fast structural + semantic validation for a Lesson Package.
 * Formal Draft 2020-12 schema validation is intentionally performed by
 * validateLessonPackageWithFormalSchemas; this function owns cross-file and
 * authority invariants so every lesson gets the same gate as the reference fixture.
 */
export function validateLessonPackageDirectory(dir) {
  const errors = [];
  const base = path.resolve(dir);
  const manifestPath = path.join(base, 'package.manifest.json');
  if (!fs.existsSync(manifestPath)) return { valid: false, errors: ['missing package.manifest.json'] };

  let manifest;
  try {
    manifest = readJson(manifestPath);
  } catch (error) {
    return { valid: false, errors: [`invalid package.manifest.json: ${error instanceof Error ? error.message : String(error)}`] };
  }

  for (const key of ['packageSchemaVersion', 'runtimeApiVersion', 'packageId', 'lessonRef', 'activitiesRef', 'appletManifestsRef', 'configsRef']) {
    if (manifest[key] === undefined) errors.push(`package.manifest missing ${key}`);
  }
  if (manifest.packageSchemaVersion !== 1) errors.push('packageSchemaVersion must be 1');
  if (manifest.runtimeApiVersion !== 1) errors.push('runtimeApiVersion must be 1');
  if (typeof manifest.packageId !== 'string' || !manifest.packageId) errors.push('packageId must be non-empty string');

  const lesson = loadReferencedJson(base, manifest.lessonRef, 'lessonRef', errors);
  const activities = loadReferencedJson(base, manifest.activitiesRef, 'activitiesRef', errors);
  const manifests = loadReferencedJson(base, manifest.appletManifestsRef, 'appletManifestsRef', errors);
  const configs = loadReferencedJson(base, manifest.configsRef, 'configsRef', errors);

  for (const [name, ref] of Object.entries(isObject(manifest.optionalRefs) ? manifest.optionalRefs : {})) {
    const file = resolveInside(base, ref);
    if (!file) errors.push(`optionalRef ${name}: path escapes lesson package: ${String(ref)}`);
    else if (!fs.existsSync(file) || !fs.statSync(file).isFile()) errors.push(`missing optionalRef ${name}: ${String(ref)}`);
  }

  if (errors.length) return { valid: false, errors };

  if (!isObject(lesson) || lesson.lessonSchemaVersion !== 1) errors.push('lesson.json must be lessonSchemaVersion=1 object');
  if (typeof lesson?.lessonId !== 'string' || !lesson.lessonId) errors.push('lessonId must be non-empty string');
  if (!Array.isArray(lesson?.activities)) errors.push('lesson.activities must be array');
  if (!Array.isArray(lesson?.assets)) errors.push('lesson.assets must be array');
  if (!Array.isArray(activities)) errors.push('activities must be an array');
  if (!Array.isArray(manifests)) errors.push('appletManifests must be an array');
  if (!isObject(configs)) errors.push('configs must be an object keyed by configRef');
  if (errors.length) return { valid: false, errors, manifest, lesson, activities };

  const activityIds = new Set();
  for (const activity of activities) {
    if (!isObject(activity)) {
      errors.push('activity entry must be object');
      continue;
    }
    if (activity.activitySchemaVersion !== 1) errors.push(`${activity.activityId ?? 'activity?'}: activitySchemaVersion must be 1`);
    if (typeof activity.activityId !== 'string' || !activity.activityId) errors.push('activityId must be non-empty string');
    else if (activityIds.has(activity.activityId)) errors.push(`duplicate activityId ${activity.activityId}`);
    else activityIds.add(activity.activityId);
    if (!Array.isArray(activity.applets)) errors.push(`${activity.activityId ?? 'activity?'}: applets must be array`);
  }
  for (const id of lesson.activities) {
    if (!activityIds.has(id)) errors.push(`lesson references missing activity ${id}`);
  }

  const manifestByType = new Map();
  for (const applet of manifests) {
    if (!isObject(applet) || typeof applet.appletTypeId !== 'string' || !applet.appletTypeId) {
      errors.push('appletTypeId must be non-empty string');
      continue;
    }
    if (manifestByType.has(applet.appletTypeId)) errors.push(`duplicate appletTypeId ${applet.appletTypeId}`);
    else manifestByType.set(applet.appletTypeId, applet);

    const emitted = Array.isArray(applet.emittedEventTypes) ? applet.emittedEventTypes : [];
    const eventRefs = isObject(applet.eventSchemaRefs) ? Object.keys(applet.eventSchemaRefs) : [];
    if (new Set(emitted).size !== emitted.length || emitted.length !== eventRefs.length || emitted.some((type) => !eventRefs.includes(type))) {
      errors.push(`${applet.appletTypeId}: emittedEventTypes must exactly match eventSchemaRefs keys`);
    }
    const handled = Array.isArray(applet.handledCommandTypes) ? applet.handledCommandTypes : [];
    const commandRefs = isObject(applet.commandSchemaRefs) ? Object.keys(applet.commandSchemaRefs) : [];
    if (new Set(handled).size !== handled.length || handled.length !== commandRefs.length || handled.some((type) => !commandRefs.includes(type))) {
      errors.push(`${applet.appletTypeId}: handledCommandTypes must exactly match commandSchemaRefs keys`);
    }
    for (const eventType of emitted) {
      if (SERVER_OWNED_EVENT_PREFIXES.some((prefix) => eventType.startsWith(prefix))) {
        errors.push(`${applet.appletTypeId}: client applet may not declare server-owned event ${eventType}`);
      }
    }

    const schemaRefs = [
      applet.configSchemaRef,
      applet.stateSchemaRef,
      ...Object.values(isObject(applet.eventSchemaRefs) ? applet.eventSchemaRefs : {}),
      ...Object.values(isObject(applet.commandSchemaRefs) ? applet.commandSchemaRefs : {}),
    ];
    for (const ref of schemaRefs) {
      const file = resolveInside(base, ref);
      if (!file) errors.push(`${applet.appletTypeId}: schema ref escapes lesson package ${String(ref)}`);
      else if (!fs.existsSync(file) || !fs.statSync(file).isFile()) errors.push(`${applet.appletTypeId}: missing schema ref ${String(ref)}`);
    }
  }

  const instanceIds = new Set();
  for (const activity of activities) {
    for (const instance of Array.isArray(activity.applets) ? activity.applets : []) {
      if (!isObject(instance)) continue;
      const instanceId = instance.appletInstanceId;
      if (typeof instanceId === 'string' && instanceIds.has(instanceId)) errors.push(`duplicate appletInstanceId ${instanceId}`);
      if (typeof instanceId === 'string') instanceIds.add(instanceId);

      const applet = manifestByType.get(instance.appletTypeId);
      if (!applet) {
        errors.push(`${activity.activityId}/${instanceId ?? 'applet?'}: missing applet manifest ${String(instance.appletTypeId)}`);
        continue;
      }
      const capabilities = new Set(Array.isArray(applet.capabilities) ? applet.capabilities : []);
      for (const capability of Array.isArray(instance.requiredCapabilities) ? instance.requiredCapabilities : []) {
        if (!capabilities.has(capability)) {
          errors.push(`${activity.activityId}/${instanceId}: missing capability ${capability}`);
        }
      }
      if (instance.configRef) {
        const config = configs[instance.configRef];
        if (!config) errors.push(`${activity.activityId}/${instanceId}: missing config ${instance.configRef}`);
        else {
          if (config.appletTypeId !== instance.appletTypeId) {
            errors.push(`${instance.configRef}: appletTypeId mismatch (${config.appletTypeId} vs ${instance.appletTypeId})`);
          }
          if (config.configSchemaVersion !== applet.configSchemaVersion) {
            errors.push(`${instance.configRef}: config schema version ${config.configSchemaVersion} != manifest ${applet.configSchemaVersion}`);
          }
        }
      }
    }
  }

  for (const [configRef, config] of Object.entries(configs)) {
    if (!isObject(config)) {
      errors.push(`${configRef}: config must be object`);
      continue;
    }
    if (config.configRef !== configRef) errors.push(`${configRef}: configRef field must match key`);
    const applet = manifestByType.get(config.appletTypeId);
    if (!applet) errors.push(`${configRef}: no applet manifest for ${String(config.appletTypeId)}`);
    else if (config.configSchemaVersion !== applet.configSchemaVersion) {
      errors.push(`${configRef}: configSchemaVersion does not match applet manifest`);
    }
  }

  validateAssetFiles(base, lesson, errors);
  validatePresentation(base, manifest, activities, errors);

  return { valid: errors.length === 0, errors, manifest, lesson, activities, manifests, configs };
}

export { SERVER_OWNED_EVENT_PREFIXES };
