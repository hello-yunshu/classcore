import test from 'node:test';
import assert from 'node:assert/strict';
import { capabilityReportToSet } from '../dist/packages/platform/src/index.js';
import { checkAppletMountCompatibility } from '../dist/packages/runtime/src/index.js';
const report = {
    capabilityReportVersion: 1,
    secureContext: false,
    indexedDb: true,
    pointerEvents: true,
    webWorkers: true,
    webSocket: true,
    offscreenCanvas: false,
    serviceWorker: false,
    maxTouchPoints: 10,
    deviceMemoryGb: 3,
    userAgentFamily: 'XP21A Chromium',
};
const manifest = {
    appletTypeId: 'applet:transform-board',
    version: '0.1.2',
    hostApiVersion: 1,
    configSchemaVersion: 1,
    stateSchemaVersion: 1,
    eventSchemaVersion: 1,
    capabilities: ['drag'],
    emittedEventTypes: ['object.moved'],
    handledCommandTypes: ['transform.reset'],
    requiredPlatformCapabilities: ['pointer-events', 'indexeddb', 'websocket'],
    optionalPlatformCapabilities: ['offscreen-canvas'],
};
test('LAN HTTP capability report can mount core transform applet without secure-context features', () => {
    const caps = capabilityReportToSet(report);
    const result = checkAppletMountCompatibility(manifest, caps, 1);
    assert.equal(result.compatible, true);
    assert.equal(caps.has('secure-context'), false);
});
test('missing required platform capability fails explicitly', () => {
    const result = checkAppletMountCompatibility({ ...manifest, requiredPlatformCapabilities: ['microphone'] }, capabilityReportToSet(report), 1);
    assert.equal(result.compatible, false);
    assert.deepEqual(result.missingCapabilities, ['microphone']);
});

