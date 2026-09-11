import { findPrivateIdentityViolations } from '@classroom/contracts';
import type { BackstageStudentProjection, ProductSurface, PublicStudentProjection, ProjectedStageState, StageAudience, StageState, StudentSelfProjection, TeacherStudentProjection, } from '@classroom/contracts';
import type { IdentityDirectory } from '@classroom/server-identity';
export interface SessionPseudonymSnapshot {
    sessionId: string;
    participantToSubject: Record<string, string>;
}
export interface SessionPseudonymDirectory {
    getSubjectId(sessionId: string, participantId: string): string;
    isValidSubjectId(sessionId: string, subjectId: string): boolean;
    resolveParticipantId(sessionId: string, subjectId: string): string | null;
    snapshot(sessionId: string): SessionPseudonymSnapshot;
    restore(snapshot: SessionPseudonymSnapshot): void;
    removeSession(sessionId: string): void;
}
export class InMemorySessionPseudonymDirectory implements SessionPseudonymDirectory {
    #forward = new Map<string, Map<string, string>>();
    #reverse = new Map<string, Map<string, string>>();
    getSubjectId(sessionId: string, participantId: string): string {
        if (!participantId.startsWith('student:'))
            throw new Error('invalid-pseudonym-participant');
        let forward = this.#forward.get(sessionId);
        if (!forward) {
            forward = new Map();
            this.#forward.set(sessionId, forward);
        }
        const existing = forward.get(participantId);
        if (existing)
            return existing;
        const used = new Set(this.#reverse.get(sessionId)?.keys() ?? []);
        let next = 1;
        while (used.has(`anon:${String(next).padStart(2, '0')}`))
            next += 1;
        const id = `anon:${String(next).padStart(2, '0')}`;
        forward.set(participantId, id);
        let reverse = this.#reverse.get(sessionId);
        if (!reverse) {
            reverse = new Map();
            this.#reverse.set(sessionId, reverse);
        }
        reverse.set(id, participantId);
        return id;
    }
    isValidSubjectId(sessionId: string, subjectId: string): boolean { return this.#reverse.get(sessionId)?.has(subjectId) ?? false; }
    resolveParticipantId(sessionId: string, subjectId: string): string | null { return this.#reverse.get(sessionId)?.get(subjectId) ?? null; }
    snapshot(sessionId: string): SessionPseudonymSnapshot { return { sessionId, participantToSubject: Object.fromEntries(this.#forward.get(sessionId) ?? []) }; }
    removeSession(sessionId: string): void { this.#forward.delete(sessionId); this.#reverse.delete(sessionId); }
    restore(snapshot: SessionPseudonymSnapshot): void {
        const forward = new Map<string, string>();
        const reverse = new Map<string, string>();
        for (const [participantId, subjectId] of Object.entries(snapshot.participantToSubject)) {
            if (!participantId.startsWith('student:'))
                throw new Error('invalid-pseudonym-participant');
            if (!/^anon:\d+$/.test(subjectId))
                throw new Error('invalid-public-subject');
            if (forward.has(participantId))
                throw new Error('duplicate-pseudonym-participant');
            if (reverse.has(subjectId))
                throw new Error('duplicate-public-subject');
            forward.set(participantId, subjectId);
            reverse.set(subjectId, participantId);
        }
        this.#forward.set(snapshot.sessionId, forward);
        this.#reverse.set(snapshot.sessionId, reverse);
    }
}
function subjectLabel(subjectId: string): string {
    const match = /^anon:(\d+)$/.exec(subjectId);
    return match ? `学生${match[1]}` : '学生';
}
export interface TeacherStudentProjectionReader {
    forTeacher(sessionId: string, participantId: string): TeacherStudentProjection;
}
export interface PublicStudentProjectionReader {
    forPublic(sessionId: string, participantId: string): PublicStudentProjection;
}
export interface BackstageStudentProjectionReader {
    forBackstage(sessionId: string, participantId: string): BackstageStudentProjection;
}
export class StudentProjectionService implements TeacherStudentProjectionReader, PublicStudentProjectionReader, BackstageStudentProjectionReader {
    constructor(private readonly identities: IdentityDirectory, private readonly pseudonyms: SessionPseudonymDirectory) { }
    forTeacher(sessionId: string, participantId: string): TeacherStudentProjection {
        const record = this.identities.getStudent(sessionId, participantId);
        if (!record)
            throw new Error('student-identity-not-found');
        return { participantId: record.participantId, displayName: record.displayName, seatNo: record.seatNo ?? null, classId: record.classId ?? null };
    }
    forBackstage(sessionId: string, participantId: string): BackstageStudentProjection {
        const record = this.identities.getStudent(sessionId, participantId);
        if (!record)
            throw new Error('student-identity-not-found');
        return { participantId: record.participantId, displayName: record.displayName, seatNo: record.seatNo ?? null, classId: record.classId ?? null, rosterId: record.rosterId ?? null };
    }
    forSelf(sessionId: string, viewerParticipantId: string, subjectParticipantId: string): StudentSelfProjection {
        if (viewerParticipantId !== subjectParticipantId)
            throw new Error('student-self-projection-only');
        const record = this.identities.getStudent(sessionId, subjectParticipantId);
        if (!record)
            throw new Error('student-identity-not-found');
        return { participantId: record.participantId, displayName: record.displayName, seatNo: record.seatNo ?? null };
    }
    forPublic(sessionId: string, participantId: string): PublicStudentProjection {
        if (!this.identities.getStudent(sessionId, participantId))
            throw new Error('student-identity-not-found');
        const subjectId = this.pseudonyms.getSubjectId(sessionId, participantId);
        return { subjectId, label: subjectLabel(subjectId) };
    }
    project(sessionId: string, participantId: string, surface: ProductSurface, viewerParticipantId?: string | null): StudentSelfProjection | TeacherStudentProjection | BackstageStudentProjection | PublicStudentProjection {
        if (surface === 'student')
            return this.forSelf(sessionId, viewerParticipantId ?? '', participantId);
        if (surface === 'teacher-runtime')
            return this.forTeacher(sessionId, participantId);
        if (surface === 'backstage')
            return this.forBackstage(sessionId, participantId);
        if (surface === 'observer' || surface === 'display')
            return this.forPublic(sessionId, participantId);
        throw new Error('surface-has-no-live-student-identity-projection');
    }
}
export interface TeacherStageProjectionContext {
    sessionId: string;
    students: TeacherStudentProjectionReader;
}
export interface PublicStageProjectionContext {
    sessionId: string;
    students: PublicStudentProjectionReader;
}
export interface TeacherStageContentProjector {
    project(state: StageState, audience: 'teacher-runtime', context: TeacherStageProjectionContext): Record<string, unknown>;
}
export interface PublicStageContentProjector {
    project(state: StageState, audience: 'observer' | 'display', context: PublicStageProjectionContext): Record<string, unknown>;
}
export interface StageContentProjectionSet {
    teacher: TeacherStageContentProjector;
    public: PublicStageContentProjector;
}
/**
 * Stage canonical state stays server-side. Public projectors receive a capability-limited
 * context that can only produce pseudonymous student projections; they cannot call teacher/backstage identity methods.
 */
export class StageProjectionRegistry {
    #projectors = new Map<string, StageContentProjectionSet>();
    register(contentType: string, projectors: StageContentProjectionSet): void {
        if (this.#projectors.has(contentType))
            throw new Error('duplicate-stage-projector');
        this.#projectors.set(contentType, projectors);
    }
    project(state: StageState, audience: StageAudience, studentProjection: StudentProjectionService): ProjectedStageState {
        const projectors = this.#projectors.get(state.contentType);
        if (!projectors)
            throw new Error(`missing-stage-projector:${state.contentType}`);
        let payload: Record<string, unknown>;
        if (audience === 'teacher-runtime') {
            const teacherStudents: TeacherStudentProjectionReader = { forTeacher: studentProjection.forTeacher.bind(studentProjection) };
            payload = projectors.teacher.project(state, audience, { sessionId: state.sessionId, students: teacherStudents });
        }
        else {
            const publicStudents: PublicStudentProjectionReader = { forPublic: studentProjection.forPublic.bind(studentProjection) };
            payload = projectors.public.project(state, audience, { sessionId: state.sessionId, students: publicStudents });
            assertPublicProjectionHasNoPrivateIdentity(payload);
        }
        return { sessionId: state.sessionId, revision: state.revision, contentType: state.contentType, audience, payload };
    }
}
/** 非学生内容也必须显式注册；不能把 canonical Stage 自动透传给 public surface。 */
export const passthroughNonStudentProjectionSet: StageContentProjectionSet = {
    teacher: { project(state) { return structuredClone(state.payload); } },
    public: { project(state) { return structuredClone(state.payload); } },
};
/**
 * 公共输出的第二道防线。主隔离机制是 capability-limited projector context；
 * 本守卫只负责抓住明显的内部字段/稳定 participant ref，不承担“识别所有可能姓名”的任务。
 */
export function assertPublicProjectionHasNoPrivateIdentity(value: unknown, path = '$'): void {
    const violation = findPrivateIdentityViolations(value, path)[0];
    if (!violation)
        return;
    if (violation.kind === 'field')
        throw new Error(`private-identity-field:${violation.path}`);
    throw new Error(`private-identity-reference:${violation.path}`);
}

export interface WidgetRuntimeContext {
    sessionId: string;
    activityId: string | null;
    audience: StageAudience;
    selector: string;
    parameters: Record<string, unknown>;
    data: Record<string, unknown>;
}
export interface WidgetDefinition {
    widgetType: string;
    render(context: WidgetRuntimeContext): Record<string, unknown>;
}

/** Generic selector-to-widget boundary. Widget code receives already projected data. */
export class WidgetRegistry {
    #widgets = new Map<string, WidgetDefinition>();
    register(definition: WidgetDefinition): void {
        if (!/^widget:[a-z0-9-]+$/.test(definition.widgetType)) throw new Error('invalid-widget-type');
        if (this.#widgets.has(definition.widgetType)) throw new Error(`duplicate-widget:${definition.widgetType}`);
        this.#widgets.set(definition.widgetType, definition);
    }
    resolve(widgetType: string): WidgetDefinition {
        const definition = this.#widgets.get(widgetType);
        if (!definition) throw new Error(`widget-not-found:${widgetType}`);
        return definition;
    }
    render(binding: import('@classroom/contracts').WidgetBinding, context: Omit<WidgetRuntimeContext, 'selector' | 'parameters'>): Record<string, unknown> {
        if (!binding.audience.includes(context.audience)) throw new Error('widget-audience-forbidden');
        const payload = this.resolve(binding.widgetType).render({ ...context, selector: binding.selector, parameters: structuredClone(binding.parameters ?? {}) });
        if (context.audience !== 'teacher-runtime') assertPublicProjectionHasNoPrivateIdentity(payload);
        return payload;
    }
    list(): string[] { return [...this.#widgets.keys()]; }
}

export function resolveWidgetSelector(selector: string, data: Record<string, Record<string, unknown>>): Record<string, unknown> {
    if (!['teacher-focus', 'recommended-resource', 'current-activity-summary', 'selected-artifact', 'selected-live-view', 'student-comparison'].includes(selector))
        throw new Error(`unsupported-widget-selector:${selector}`);
    return structuredClone(data[selector] ?? {});
}
