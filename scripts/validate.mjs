import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contracts = path.join(root, 'docs/contracts/v0.1.2');
const example = path.join(root, 'examples/pattern-restoration');
const errors = [];
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const exists = (p) => fs.existsSync(p);
function validateValue(v, s, p = '$') {
    if (!s || typeof s !== 'object')
        return;
    if ('const' in s && v !== s.const)
        errors.push(`${p}: expected const ${s.const}`);
    if (s.enum && !s.enum.includes(v))
        errors.push(`${p}: not in enum`);
    const ts = Array.isArray(s.type) ? s.type : [s.type].filter(Boolean);
    if (ts.length) {
        const actual = v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v;
        const ok = ts.some(t => t === actual || (t === 'number' && typeof v === 'number'));
        if (!ok) {
            errors.push(`${p}: expected ${ts.join('|')}, got ${actual}`);
            return;
        }
    }
    if (typeof v === 'string') {
        if (s.minLength && v.length < s.minLength)
            errors.push(`${p}: too short`);
        if (s.pattern && !new RegExp(s.pattern).test(v))
            errors.push(`${p}: pattern mismatch`);
    }
    if (typeof v === 'number') {
        if (s.minimum !== undefined && v < s.minimum)
            errors.push(`${p}: below minimum`);
        if (s.maximum !== undefined && v > s.maximum)
            errors.push(`${p}: above maximum`);
    }
    if (Array.isArray(v)) {
        if (s.minItems && v.length < s.minItems)
            errors.push(`${p}: too few items`);
        if (s.uniqueItems && new Set(v.map(x => JSON.stringify(x))).size !== v.length)
            errors.push(`${p}: duplicate items`);
        if (s.items)
            v.forEach((x, i) => validateValue(x, s.items, `${p}[${i}]`));
    }
    if (v && typeof v === 'object' && !Array.isArray(v)) {
        for (const k of s.required ?? [])
            if (!(k in v))
                errors.push(`${p}: missing ${k}`);
        for (const [k, sv] of Object.entries(s.properties ?? {}))
            if (k in v)
                validateValue(v[k], sv, `${p}.${k}`);
        if (s.additionalProperties === false) {
            for (const k of Object.keys(v))
                if (!(k in (s.properties ?? {})))
                    errors.push(`${p}: unexpected ${k}`);
        }
    }
}
function schema(name) { return read(path.join(contracts, name)); }
function def(schemaFile, name, value, label = schemaFile) { const s = schema(schemaFile); validateValue(value, s.$defs?.[name] ?? s, label); }
// Package is the authoritative entrypoint: validation must not depend on hard-coded lesson file names.
const pkg = read(path.join(example, 'package.manifest.json'));
def('24-lesson-package.schema.json', 'root', pkg, 'package.manifest');
for (const ref of [pkg.lessonRef, pkg.activitiesRef, pkg.appletManifestsRef, pkg.configsRef, ...Object.values(pkg.optionalRefs ?? {})])
    if (!exists(path.join(example, ref)))
        errors.push(`package references missing file ${ref}`);
const lesson = read(path.join(example, pkg.lessonRef));
const activities = read(path.join(example, pkg.activitiesRef));
const manifests = read(path.join(example, pkg.appletManifestsRef));
const configs = read(path.join(example, pkg.configsRef));
def('02-lesson.schema.json', 'root', lesson, 'lesson');
def('03-session.schema.json', 'root', read(path.join(example, 'session.example.json')), 'session');
activities.forEach((a, i) => def('05-activity.schema.json', 'root', a, `activity[${i}]`));
manifests.forEach((m, i) => def('08-applet-manifest.schema.json', 'root', m, `applet[${i}]`));
for (const [ref, cfg] of Object.entries(configs)) {
    def('08a-applet-config.schema.json', 'root', cfg, `config:${ref}`);
    if (cfg.configRef !== ref)
        errors.push(`config map key ${ref} differs from configRef ${cfg.configRef}`);
}
const optional = pkg.optionalRefs ?? {};
if (optional.workgroups) {
    const v = read(path.join(example, optional.workgroups));
    v.forEach((w, i) => def('13-workgroup.schema.json', 'root', w, `workgroup[${i}]`));
}
if (optional.featurePolicy)
    def('14-feature-readiness.schema.json', 'featurePolicy', read(path.join(example, optional.featurePolicy)), 'featurePolicy');
if (optional.preflight)
    def('14-feature-readiness.schema.json', 'readiness', read(path.join(example, optional.preflight)), 'preflight');
if (exists(path.join(example, 'client-readiness.example.json')))
    def('14-feature-readiness.schema.json', 'clientReadiness', read(path.join(example, 'client-readiness.example.json')), 'clientReadiness');
let presentationAsset = null;
if (optional.presentationAsset) {
    const ps = read(path.join(root, 'docs/capabilities/presentation/v0.1/presentation.schema.json'));
    presentationAsset = read(path.join(example, optional.presentationAsset));
    validateValue(presentationAsset, ps.$defs.asset, 'presentationAsset');
    const bindingIds = new Set();
    for (const b of presentationAsset.classroomBindings ?? []) {
        if (bindingIds.has(b.bindingId))
            errors.push(`presentation duplicate bindingId ${b.bindingId}`);
        bindingIds.add(b.bindingId);
        if (typeof b.source?.ref === 'string' && /^(student|teacher|observer|display|anon):/.test(b.source.ref))
            errors.push(`presentation binding ${b.bindingId} embeds runtime identity ${b.source.ref}`);
    }
}
const joinFlow = read(path.join(example, 'join-flow.example.json'));
for (const [k, defName] of [['joinRequest', 'joinRequest'], ['membership', 'membership'], ['joinGrant', 'joinGrant']])
    def('04-participant-connection.schema.json', defName, joinFlow[k], `joinFlow.${k}`);
def('23-protocol-handshake.schema.json', 'clientHello', joinFlow.clientHello, 'joinFlow.clientHello');
def('23-protocol-handshake.schema.json', 'serverHello', joinFlow.serverHello, 'joinFlow.serverHello');
const live = read(path.join(example, 'live-subscription.example.json'));
def('25-live-subscription.schema.json', 'request', live.request, 'live.request');
def('25-live-subscription.schema.json', 'grant', live.grant, 'live.grant');
const activityIds = new Set(activities.map(a => a.activityId));
for (const id of lesson.activities)
    if (!activityIds.has(id))
        errors.push(`lesson references missing activity ${id}`);
const manifestByType = new Map(manifests.map(m => [m.appletTypeId, m]));
const instanceIds = new Set();
const SERVER_ONLY_PREFIXES = ['session.', 'activity.', 'stage.', 'submission.', 'advice.', 'controller.', 'system.'];
for (const m of manifests) {
    for (const eventType of m.emittedEventTypes ?? [])
        if (SERVER_ONLY_PREFIXES.some(p => eventType.startsWith(p)))
            errors.push(`${m.appletTypeId}: client applet may not declare server-owned event ${eventType}`);
    for (const ref of [m.configSchemaRef, m.stateSchemaRef, ...Object.values(m.eventSchemaRefs ?? {}), ...Object.values(m.commandSchemaRefs ?? {})]) {
        if (typeof ref !== 'string' || !exists(path.join(example, ref)))
            errors.push(`${m.appletTypeId}: missing schema ref ${String(ref)}`);
    }
    const eventKeys = Object.keys(m.eventSchemaRefs ?? {}).sort().join('|');
    const emitted = [...(m.emittedEventTypes ?? [])].sort().join('|');
    if (eventKeys !== emitted)
        errors.push(`${m.appletTypeId}: eventSchemaRefs must exactly cover emittedEventTypes`);
    const commandKeys = Object.keys(m.commandSchemaRefs ?? {}).sort().join('|');
    const handled = [...(m.handledCommandTypes ?? [])].sort().join('|');
    if (commandKeys !== handled)
        errors.push(`${m.appletTypeId}: commandSchemaRefs must exactly cover handledCommandTypes`);
}
for (const a of activities) {
    for (const ref of a.applets) {
        if (instanceIds.has(ref.appletInstanceId))
            errors.push(`duplicate appletInstanceId ${ref.appletInstanceId}`);
        instanceIds.add(ref.appletInstanceId);
        const m = manifestByType.get(ref.appletTypeId);
        if (!m) {
            errors.push(`${a.activityId}: missing applet manifest ${ref.appletTypeId}`);
            continue;
        }
        for (const cap of ref.requiredCapabilities)
            if (!m.capabilities.includes(cap))
                errors.push(`${a.activityId}/${ref.appletInstanceId}: missing capability ${cap}`);
        if (ref.configRef) {
            const cfg = configs[ref.configRef];
            if (!cfg) {
                errors.push(`${a.activityId}/${ref.appletInstanceId}: missing config ${ref.configRef}`);
                continue;
            }
            if (cfg.appletTypeId !== ref.appletTypeId)
                errors.push(`${ref.configRef}: appletTypeId mismatch (${cfg.appletTypeId} vs ${ref.appletTypeId})`);
            if (cfg.configSchemaVersion !== m.configSchemaVersion)
                errors.push(`${ref.configRef}: config schema version ${cfg.configSchemaVersion} != manifest ${m.configSchemaVersion}`);
        }
    }
}
const presentationSceneIds = new Set((presentationAsset?.document?.scenes ?? []).map(s => s?.id).filter(Boolean));
for (const a of activities) {
    if (a.stagePolicy?.contentType === 'presentation:deck') {
        if (!presentationAsset)
            errors.push(`${a.activityId}: presentation Stage policy requires optionalRefs.presentationAsset`);
        else {
            if (a.stagePolicy.deckId !== presentationAsset.deckId)
                errors.push(`${a.activityId}: stagePolicy deckId does not match presentation asset`);
            if (a.stagePolicy.sceneId && presentationSceneIds.size && !presentationSceneIds.has(a.stagePolicy.sceneId))
                errors.push(`${a.activityId}: unknown presentation scene ${a.stagePolicy.sceneId}`);
        }
    }
}
if (activities.some(a => a.stagePolicy?.contentType === 'presentation:deck')) {
    const fp = optional.featurePolicy ? read(path.join(example, optional.featurePolicy)) : null;
    if (fp?.features?.presentationRuntime !== true)
        errors.push('presentation Stage policy requires presentationRuntime feature=true in example policy');
}
for (const asset of lesson.assets) {
    const p = path.join(example, asset.path);
    if (!exists(p)) {
        errors.push(`missing asset file ${asset.path}`);
        continue;
    }
    const b = fs.readFileSync(p);
    if (asset.preload === true && (typeof asset.size !== 'number' || typeof asset.sha256 !== 'string'))
        errors.push(`preload asset ${asset.assetId} must include size + sha256`);
    if (asset.size !== null && asset.size !== undefined && asset.size !== b.length)
        errors.push(`asset size mismatch ${asset.assetId}`);
    if (asset.sha256) {
        const h = crypto.createHash('sha256').update(b).digest('hex');
        if (h !== asset.sha256)
            errors.push(`asset hash mismatch ${asset.assetId}`);
    }
}
const requiredDocs = [
    '00-glossary.md',
    '01-identifiers.md',
    '15-delivery.md',
    '16-versioning.md',
    '17-state-machines.md',
    '18-authority-map.md',
    '19-platform-abstraction.md',
    '20-authorization.md',
    '21-event-authority.md',
    '26-security-deployment.md',
    '27-interoperability-boundary.md',
    '28-migrations.md',
    '29-read-model-projections.md',
    '30-accessibility-semantic-actions.md',
    '31-local-first-client.md',
    '32-data-governance.md',
    '33-external-tool-gateway.md',
    '34-protocol-negotiation.md',
    '35-live-qos-backpressure.md',
    '36-session-pinning-transactions-recovery.md',
    '37-deployment-capability-matrix.md',
    '38-intelligence-data-boundary.md',
    '39-extension-collaboration-boundary.md',
];
for (const f of requiredDocs)
    if (!exists(path.join(contracts, f)))
        errors.push(`missing contract doc ${f}`);
const requiredDevelopmentDocs = [
    'MASTER-DEVELOPMENT-PLAN.md',
    'PRESENTATION-ENGINE-DECISION.md',
    'PRESENTATION-D7-SCOPE.md',
    'TOOLCHAIN-BASELINE.md',
    'TEST-STRATEGY.md',
    'CLIENT-RUNTIME-PROFILES.md',
    'RELEASE-GATES.md',
    'RISK-REGISTER.md',
    'BRANCH-RELEASE-STRATEGY.md',
    'TOOLCHAIN-REPRODUCIBILITY.md',
];
for (const f of requiredDevelopmentDocs)
    if (!exists(path.join(root, 'docs/development', f)))
        errors.push(`missing development doc ${f}`);
for (const handoffFile of ['AGENTS.md', 'CODEX-HANDOFF.md', '.env.example', 'package-lock.json', 'FOUNDATION-SHA256SUMS'])
    if (!exists(path.join(root, handoffFile)))
        errors.push(`missing handoff file ${handoffFile}`);
if (!exists(path.join(root, 'packages/presentation/src/index.ts')))
    errors.push('missing presentation capability package');
if (!exists(path.join(root, 'docs/capabilities/presentation/v0.1/presentation.schema.json')))
    errors.push('missing presentation capability schema');
if (errors.length) {
    console.error('Contract validation FAILED');
    errors.forEach(e => console.error(' -', e));
    process.exit(1);
}
console.log('Contract validation PASSED');
console.log(`Package: ${pkg.packageId}`);
console.log(`Lesson: ${lesson.title}`);
console.log(`Activities: ${activities.length}; Applet types: ${manifests.length}; Configs: ${Object.keys(configs).length}; Assets: ${lesson.assets.length}`);

