import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root = new URL('../docs/contracts/v0.1.2/', import.meta.url);
const load = (name) => JSON.parse(fs.readFileSync(new URL(name, root), 'utf8'));
test('wire schema parity regressions remain closed', () => {
    const ack = load('22-protocol-result.schema.json').$defs.eventAck;
    assert.ok(ack.required.includes('duplicate'));
    const snap = load('09-applet-state.schema.json').$defs.snapshot;
    assert.ok(snap.required.includes('capturedAt'));
    const command = load('06-command.schema.json');
    assert.equal(Object.prototype.hasOwnProperty.call(command.properties, 'sessionId'), false);
    const participant = load('04-participant-connection.schema.json').$defs.participant;
    assert.equal(Object.prototype.hasOwnProperty.call(participant.properties, 'displayName'), false);
    assert.equal(participant.properties.role.enum.includes('system'), false);
    const surface = load('40-surface-projection.schema.json').$defs.publicStudentProjection;
    assert.equal(surface.additionalProperties, false);
    const manifest = load('08-applet-manifest.schema.json');
    for (const k of ['configSchemaVersion', 'stateSchemaVersion', 'eventSchemaVersion', 'commandSchemaVersion', 'emittedEventTypes', 'configSchemaRef', 'stateSchemaRef', 'eventSchemaRefs', 'commandSchemaRefs'])
        assert.ok(manifest.required.includes(k));
});

