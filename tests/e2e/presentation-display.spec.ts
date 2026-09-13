import { test } from '@playwright/test';

// This is the contract-shaped Display gate. It stays skipped until an
// authenticated classroom fixture can prepare a real Office deck; a skipped
// gate is evidence of missing product setup, never a playback PASS.
test.describe.skip('Presentation Display playback fidelity', () => {
    test('prepare mounts the first slide from the exact pinned revision', async () => {});
    test('teacher animation and next-slide controls reach Display', async () => {});
    test('next/previous skips hidden slides while explicit goto remains possible', async () => {});
    test('refresh and WebSocket reconnect restore exact scene and step', async () => {});
    test('revision switch remounts the exact asset', async () => {});
    test('custom aspect ratio is preserved without 16:9 distortion', async () => {});
});
