export const analyticsProvider = {
  provenance: { mode: 'rule', name: 'lesson-profile', version: '1' },
  async analyze(input) {
    const events = [...input.events].sort((left, right) => left.serverSeq - right.serverSeq);
    return {
      classifications: [],
      metrics: [{ name: 'event-count', value: events.length, unit: 'events' }],
      recommendations: [],
    };
  },
};
