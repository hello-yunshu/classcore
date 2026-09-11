import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SURFACE_DESCRIPTORS, PRODUCT_SURFACES, ENGINEERING_SURFACES, SERVICE_PLANE, canOpenBackstage } from '../dist/packages/surfaces/src/index.js';
import { InMemoryIdentityDirectory } from '../dist/packages/identity/src/index.js';
import { InMemorySessionPseudonymDirectory, StudentProjectionService, StageProjectionRegistry, assertPublicProjectionHasNoPrivateIdentity, passthroughNonStudentProjectionSet, } from '../dist/packages/projections/src/index.js';
const sessionId = 'session:A';
function setup() {
    const identities = new InMemoryIdentityDirectory();
    identities.upsertStudent({ sessionId, participantId: 'student:S17', displayName: '学生甲', seatNo: '17', rosterId: 'roster:17', classId: 'class:5-5', updatedAt: '2026-09-10T00:00:00Z' });
    const pseudonyms = new InMemorySessionPseudonymDirectory();
    return { identities, pseudonyms, service: new StudentProjectionService(identities, pseudonyms) };
}
test('surface registry contains exactly six product surfaces plus one engineering surface', () => {
    assert.equal(PRODUCT_SURFACES.length, 6);
    assert.equal(ENGINEERING_SURFACES.length, 1);
    assert.deepEqual(new Set(PRODUCT_SURFACES.map(x => x.surfaceId)), new Set(['student', 'teacher-runtime', 'display', 'observer', 'backstage', 'authoring-studio']));
    assert.equal(SURFACE_DESCRIPTORS.backstage.participantRole, null);
    assert.equal(SURFACE_DESCRIPTORS['authoring-studio'].participantRole, null);
    assert.equal(SURFACE_DESCRIPTORS['simulation-rehearsal'].participantRole, null);
    assert.equal(SURFACE_DESCRIPTORS.display.identityView, 'public-pseudonymous');
    assert.equal(SURFACE_DESCRIPTORS.observer.identityView, 'public-pseudonymous');
    assert.equal(SERVICE_PLANE['identity-directory'].trustZone, 'server-only');
    assert.equal(SERVICE_PLANE['projection-service'].requiredForD7, true);
});
test('teacher/backstage can identify, student can identify self, observer/display share pseudonym', () => {
    const { service } = setup();
    const teacher = service.forTeacher(sessionId, 'student:S17');
    const backstage = service.forBackstage(sessionId, 'student:S17');
    const self = service.forSelf(sessionId, 'student:S17', 'student:S17');
    const observer = service.forPublic(sessionId, 'student:S17');
    const display = service.forPublic(sessionId, 'student:S17');
    assert.equal(teacher.displayName, '学生甲');
    assert.equal(backstage.rosterId, 'roster:17');
    assert.equal(self.seatNo, '17');
    assert.equal(observer.subjectId, display.subjectId);
    assert.equal(observer.label, display.label);
    assert.throws(() => service.forSelf(sessionId, 'student:S23', 'student:S17'));
    assert.throws(() => service.forPublic(sessionId, 'student:DOES-NOT-EXIST'), /student-identity-not-found/);
    assert.throws(() => service.project(sessionId, 'student:S17', 'authoring-studio'));
});
test('pseudonym mapping survives restart snapshot and stays consistent across Observer and Display', () => {
    const { pseudonyms } = setup();
    const first = pseudonyms.getSubjectId(sessionId, 'student:S17');
    pseudonyms.getSubjectId(sessionId, 'student:S23');
    assert.throws(() => pseudonyms.getSubjectId(sessionId, 'teacher:T01'), /invalid-pseudonym-participant/);
    const snapshot = pseudonyms.snapshot(sessionId);
    const restored = new InMemorySessionPseudonymDirectory();
    restored.restore(snapshot);
    assert.equal(restored.getSubjectId(sessionId, 'student:S17'), first);
    assert.equal(restored.resolveParticipantId(sessionId, first), 'student:S17');
});
test('public projection guard rejects raw participant/name fields and stable participant refs', () => {
    assert.doesNotThrow(() => assertPublicProjectionHasNoPrivateIdentity({ subject: { subjectId: 'anon:01', label: '学生01' }, progress: 0.5, chart: { name: '策略A' } }));
    assert.throws(() => assertPublicProjectionHasNoPrivateIdentity({ participantId: 'student:S17' }));
    assert.throws(() => assertPublicProjectionHasNoPrivateIdentity({ nested: { displayName: '学生甲' } }));
    assert.throws(() => assertPublicProjectionHasNoPrivateIdentity({ ref: 'student:S17' }));
    assert.throws(() => assertPublicProjectionHasNoPrivateIdentity({ seatNo: '17' }));
    assert.throws(() => assertPublicProjectionHasNoPrivateIdentity({ classId: '5-5' }));
    assert.throws(() => assertPublicProjectionHasNoPrivateIdentity({ membershipId: 'membership:S17' }));
    assert.throws(() => assertPublicProjectionHasNoPrivateIdentity({ connectionId: 'connection:abc' }));
    assert.throws(() => assertPublicProjectionHasNoPrivateIdentity({ ref: 'membership:S17' }));
    assert.throws(() => assertPublicProjectionHasNoPrivateIdentity({ targets: ['student:S17'] }));
    assert.throws(() => assertPublicProjectionHasNoPrivateIdentity({ byStudent: { 'student:S17': { score: 1 } } }));
    assert.throws(() => assertPublicProjectionHasNoPrivateIdentity({ ref: 'roster:17' }));
    assert.throws(() => assertPublicProjectionHasNoPrivateIdentity({ ref: 'class:5-5' }));
    assert.throws(() => assertPublicProjectionHasNoPrivateIdentity({ deviceId: 'device:xp21a-01' }));
    assert.throws(() => assertPublicProjectionHasNoPrivateIdentity({ participantHint: '17' }));
    assert.throws(() => assertPublicProjectionHasNoPrivateIdentity({ reconnectToken: 'secret' }));
    assert.throws(() => assertPublicProjectionHasNoPrivateIdentity({ accessToken: 'secret' }));
});
test('Stage projection uses capability-limited teacher/public contexts and fails closed', () => {
    const { service } = setup();
    const registry = new StageProjectionRegistry();
    const canonical = { sessionId, revision: 4, contentType: 'core:student-live-view', payload: { participantId: 'student:S17', progress: 0.5 } };
    assert.throws(() => registry.project(canonical, 'display', service));
    registry.register('core:student-live-view', {
        teacher: { project(state, _audience, ctx) {
                const participantId = String(state.payload.participantId);
                return { ...ctx.students.forTeacher(state.sessionId, participantId), progress: state.payload.progress };
            } },
        public: { project(state, _audience, ctx) {
                assert.equal('forTeacher' in ctx.students, false);
                const participantId = String(state.payload.participantId);
                return { subject: ctx.students.forPublic(state.sessionId, participantId), progress: state.payload.progress };
            } },
    });
    const observer = registry.project(canonical, 'observer', service);
    const display = registry.project(canonical, 'display', service);
    const teacher = registry.project(canonical, 'teacher-runtime', service);
    assert.deepEqual(observer.payload, display.payload);
    assert.doesNotThrow(() => assertPublicProjectionHasNoPrivateIdentity(observer.payload));
    assert.doesNotThrow(() => assertPublicProjectionHasNoPrivateIdentity(display.payload));
    assert.equal(teacher.payload.displayName, '学生甲');
    registry.register('core:bad-public', {
        teacher: { project() { return {}; } },
        public: { project() { return { participantId: 'student:S17' }; } },
    });
    assert.throws(() => registry.project({ sessionId, revision: 5, contentType: 'core:bad-public', payload: {} }, 'display', service));
});
test('non-student stage content still requires explicit registration', () => {
    const { service } = setup();
    const registry = new StageProjectionRegistry();
    registry.register('presentation:deck', passthroughNonStudentProjectionSet);
    const out = registry.project({ sessionId, revision: 1, contentType: 'presentation:deck', payload: { deckId: 'deck:1', sceneId: 'scene:1' } }, 'display', service);
    assert.equal(out.payload.deckId, 'deck:1');
});
test('browser surfaces cannot depend directly on server-only identity/projection packages', () => {
    const appNames = ['student-web', 'teacher-web', 'display-web', 'observer-web', 'backstage', 'presentation-studio', 'simulation-rehearsal'];
    for (const app of appNames) {
        const pkg = JSON.parse(fs.readFileSync(new URL(`../apps/${app}/package.json`, import.meta.url), 'utf8'));
        const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
        for (const forbidden of ['@classroom/server-identity', '@classroom/server-projections', '@classroom/storage', '@classroom/realtime', '@classroom/runtime']) {
            assert.equal(forbidden in deps, false, `${app} imports server/service-plane package ${forbidden}`);
        }
    }
    const server = JSON.parse(fs.readFileSync(new URL('../apps/server/package.json', import.meta.url), 'utf8'));
    assert.equal('@classroom/server-identity' in server.dependencies, true);
    assert.equal('@classroom/server-projections' in server.dependencies, true);
});
test('backstage localhost-first policy uses peer address, not HTTP Host header', () => {
    assert.equal(canOpenBackstage({ mode: 'localhost-only' }, { remoteAddress: '127.0.0.1' }), true);
    assert.equal(canOpenBackstage({ mode: 'localhost-only' }, { remoteAddress: '::1' }), true);
    assert.equal(canOpenBackstage({ mode: 'localhost-only' }, { remoteAddress: '::ffff:127.0.0.1' }), true);
    assert.equal(canOpenBackstage({ mode: 'localhost-only' }, { remoteAddress: '192.168.1.5' }), false);
    assert.equal(canOpenBackstage({ mode: 'authenticated-remote' }, { remoteAddress: '192.168.1.5', authenticated: false }), false);
    assert.equal(canOpenBackstage({ mode: 'authenticated-remote' }, { remoteAddress: '192.168.1.5', authenticated: true }), true);
});

