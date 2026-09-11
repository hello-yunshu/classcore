import test from 'node:test';
import assert from 'node:assert/strict';
import { updatePresentationState, applyPresentationControl, assertIdentityNeutralBinding, assertWidgetProjectionCompatible, resolveClassroomWidgetSafely } from '../dist/packages/presentation/src/index.js';
test('presentation playback state is authoritative, revisioned and engine independent', () => {
    const state = { sessionId: 'session:A', deckId: 'deck:lesson', sceneId: 'scene:1', step: 0, playState: 'idle', revision: 0 };
    const next = updatePresentationState(state, { step: 1, playState: 'playing' }, 0);
    assert.equal(next.revision, 1);
    assert.equal(next.step, 1);
    assert.throws(() => updatePresentationState(next, { step: 2 }, 0));
});
test('Observer and Display presentation widgets must receive public pseudonymous projections', async () => {
    const binding = { bindingId: 'b', widgetType: 'classroom:student-live-view', source: { type: 'semantic', selector: 'teacher-focus' } };
    const publicResult = { projection: 'public-pseudonymous', data: { subject: { subjectId: 'anon:01', label: '学生01' } } };
    const privateResult = { projection: 'teacher-identifiable', data: { participantId: 'student:S17', displayName: '学生甲' } };
    assert.doesNotThrow(() => assertWidgetProjectionCompatible({ sessionId: 'session:A', surface: 'display' }, publicResult));
    assert.doesNotThrow(() => assertWidgetProjectionCompatible({ sessionId: 'session:A', surface: 'observer' }, publicResult));
    assert.throws(() => assertWidgetProjectionCompatible({ sessionId: 'session:A', surface: 'display' }, privateResult));
    assert.throws(() => assertWidgetProjectionCompatible({ sessionId: 'session:A', surface: 'observer' }, privateResult));
    assert.throws(() => assertWidgetProjectionCompatible({ sessionId: 'session:A', surface: 'display' }, { projection: 'public-pseudonymous', data: { participantId: 'student:S17' } }));
    assert.doesNotThrow(() => assertWidgetProjectionCompatible({ sessionId: 'session:A', surface: 'teacher-runtime' }, privateResult));
    await assert.rejects(() => resolveClassroomWidgetSafely(binding, { sessionId: 'session:A', surface: 'display' }, { resolveTeacher: async () => privateResult }));
    const resolved = await resolveClassroomWidgetSafely(binding, { sessionId: 'session:A', surface: 'display' }, { resolvePublic: async () => publicResult });
    assert.equal(resolved.projection, 'public-pseudonymous');
});
test('presentation bindings are semantic and portable across classes', () => {
    assert.doesNotThrow(() => assertIdentityNeutralBinding({ bindingId: 'b', widgetType: 'classroom:student-live-view', source: { type: 'semantic', selector: 'teacher-focus', parameters: { mode: 'focus' } } }));
    assert.throws(() => assertIdentityNeutralBinding({ bindingId: 'b', widgetType: 'classroom:student-live-view', source: { type: 'semantic', selector: 'teacher-focus', parameters: { participantId: 'student:S17' } } }));
    assert.throws(() => assertIdentityNeutralBinding({ bindingId: 'b', widgetType: 'classroom:student-live-view', source: { type: 'semantic', selector: 'teacher-focus', parameters: { target: 'student:S17' } } }));
    assert.throws(() => assertIdentityNeutralBinding({ bindingId: 'b', widgetType: 'classroom:student-live-view', source: { type: 'semantic', selector: 'teacher-focus', parameters: { target: 'membership:S17' } } }));
    assert.throws(() => assertIdentityNeutralBinding({ bindingId: 'b', widgetType: 'classroom:student-live-view', source: { type: 'semantic', selector: 'teacher-focus', parameters: { targets: ['student:S17'] } } }));
    assert.throws(() => assertIdentityNeutralBinding({ bindingId: 'b', widgetType: 'classroom:student-live-view', source: { type: 'semantic', selector: 'teacher-focus', parameters: { byStudent: { 'student:S17': { score: 1 } } } } }));
    assert.throws(() => assertIdentityNeutralBinding({ bindingId: 'b', widgetType: 'classroom:student-live-view', source: { type: 'semantic', selector: 'teacher-focus', parameters: { target: 'roster:17' } } }));
    assert.throws(() => assertIdentityNeutralBinding({ bindingId: 'b', widgetType: 'classroom:student-live-view', source: { type: 'semantic', selector: 'teacher-focus', parameters: { target: 'class:5-5' } } }));
    assert.throws(() => assertIdentityNeutralBinding({ bindingId: 'student:S17', widgetType: 'classroom:student-live-view', source: { type: 'semantic', selector: 'teacher-focus' } }));
    assert.throws(() => assertIdentityNeutralBinding({ bindingId: 'b', widgetType: 'classroom:student-live-view', source: { type: 'semantic', selector: 'student:S17' } }));
    assert.throws(() => assertIdentityNeutralBinding({ bindingId: 'b', widgetType: 'classroom:student-live-view', source: { type: 'semantic', selector: 'teacher-focus' }, fallback: { type: 'static-text', text: 'roster:17' } }));
});
test('presentation control is revisioned and explicit', () => {
    const state = { sessionId: 'session:A', deckId: 'deck:lesson', sceneId: 'scene:1', step: 0, playState: 'idle', revision: 0 };
    const step = applyPresentationControl(state, { action: 'set-step', step: 1, expectedRevision: 0 });
    assert.equal(step.step, 1);
    assert.equal(step.revision, 1);
    const moved = applyPresentationControl(step, { action: 'goto', sceneId: 'scene:2', step: 0, expectedRevision: 1 });
    assert.equal(moved.sceneId, 'scene:2');
    assert.throws(() => applyPresentationControl(moved, { action: 'play', expectedRevision: 0 }));
});


test('presentation identity guards reject seat/class/membership fields on bindings and public widgets', () => {
    for (const [field, value] of [['seatNo','17'], ['classId','5-5'], ['membershipId','membership:S17'], ['connectionId','connection:abc']]) {
        assert.throws(() => assertIdentityNeutralBinding({ bindingId: 'binding:x', widgetType: 'x', source: { projection: 'public-pseudonymous', parameters: { [field]: value } } }));
        assert.throws(() => assertWidgetProjectionCompatible({ sessionId: 'session:A', surface: 'display' }, { projection: 'public-pseudonymous', data: { [field]: value } }));
    }
});
