import { performance } from 'node:perf_hooks';
const students = Number(process.env.STUDENTS ?? 50);
const observers = Number(process.env.OBSERVERS ?? 40);
const eventsPerStudent = Number(process.env.EVENTS_PER_STUDENT ?? 20);
const teacherControls = Number(process.env.TEACHER_CONTROLS ?? 100);
const observerViews = Math.min(Number(process.env.OBSERVER_VIEWS ?? 4), students);
const queueCapacity = Number(process.env.QUEUE_CAPACITY ?? 1200);
const start = performance.now();
// D6 前的轻量“协议/队列参考负载”。它不模拟真实 GPU、浏览器或 Wi‑Fi，
// 只验证：durable key 不冲突、核心流量不会因 Observer 富功能被丢弃、可丢流量先降级。
const durable = [];
for (let s = 1; s <= students; s++) {
    for (let e = 1; e <= eventsPerStudent; e++)
        durable.push(`session:A|student:S${s}|applet-instance:transform|event:${e}`);
}
if (new Set(durable).size !== durable.length)
    throw new Error('duplicate-durable-idempotency-key');
const observerFrames = observers * observerViews * 10;
const essential = durable.length + teacherControls;
if (queueCapacity < essential)
    throw new Error('reference-queue-capacity-below-essential-traffic');
const observerAccepted = Math.max(0, Math.min(observerFrames, queueCapacity - essential));
const observerDropped = observerFrames - observerAccepted;
const elapsed = performance.now() - start;
const result = { students, observers, eventsPerStudent, durableEvents: durable.length, teacherControls, observerFrames, observerAccepted, observerDropped, queueCapacity, elapsedMs: Number(elapsed.toFixed(2)) };
console.log(JSON.stringify(result, null, 2));
if (durable.length !== students * eventsPerStudent)
    process.exit(2);
if (observerDropped <= 0)
    throw new Error('reference scenario did not exercise observer shedding');

