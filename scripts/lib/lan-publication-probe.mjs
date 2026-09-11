export async function probeHostLanPublication({ addresses, classroomPort, localToolsPort, fetchFn = fetch, classroomTimeoutMs = 1500, localToolsTimeoutMs = 600 }) {
  if (!addresses.length) return { status: 'skipped', reason: 'no-non-loopback-ipv4' };
  for (const address of addresses) {
    let classroom;
    try {
      classroom = await fetchFn(`http://${address}:${classroomPort}/healthz`, { signal: AbortSignal.timeout(classroomTimeoutMs) });
    } catch {
      continue;
    }
    if (!classroom.ok) continue;
    let localToolsReachable = false;
    try {
      const localTools = await fetchFn(`http://${address}:${localToolsPort}/healthz`, { signal: AbortSignal.timeout(localToolsTimeoutMs) });
      localToolsReachable = localTools.ok;
    } catch {
      localToolsReachable = false;
    }
    if (localToolsReachable) {
      throw new Error(`SECURITY_ASSERTION_FAILED: local tools leaked onto non-loopback interface ${address}:${localToolsPort}`);
    }
    return { status: 'passed', address };
  }
  return { status: 'inconclusive', reason: 'classroom-not-reachable-via-detected-host-interface' };
}
