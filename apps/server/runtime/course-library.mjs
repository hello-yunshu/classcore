import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const MAX_RESOURCE_BYTES = 128 * 1024 * 1024;
const safeSlug = value => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || `course-${Date.now()}`;
const safeFileName = value => String(value ?? 'resource.bin').trim().replace(/[\\/\0]/g, '-').slice(0, 180) || 'resource.bin';
const now = () => new Date().toISOString();

export class CourseLibraryError extends Error {
    constructor(code, details = null) {
        super(code);
        this.name = 'CourseLibraryError';
        this.code = code;
        this.details = details;
    }
}

function readJson(file) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

export class CourseLibraryStore {
    constructor(dataDir, lessonsRoot) {
        this.root = path.resolve(dataDir, 'course-workspaces');
        this.lessonsRoot = path.resolve(lessonsRoot);
        fs.mkdirSync(this.root, { recursive: true });
    }

    #workspacePath(courseId) {
        const slug = String(courseId).replace(/^course:/, '');
        if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new CourseLibraryError('course-id-invalid');
        const directory = path.resolve(this.root, slug);
        if (!directory.startsWith(`${this.root}${path.sep}`)) throw new CourseLibraryError('course-path-invalid');
        return directory;
    }

    #summary(workspace) {
        const course = readJson(path.join(workspace, 'course.json'));
        if (!course) return null;
        const resources = Array.isArray(course.resources) ? course.resources : [];
        const base = course.baseLessonSlug ? this.#lessonSummary(course.baseLessonSlug) : null;
        return {
            ...course,
            kind: 'workspace',
            status: course.status ?? 'draft',
            runnable: course.status === 'published' && Boolean(course.baseLessonSlug),
            metadata: course.metadata ?? base?.metadata ?? {},
            activityCount: base?.activityCount ?? 0,
            activities: base?.activities ?? [],
            assets: base?.assets ?? [],
            presentation: course.presentationId
                ? { ...(base?.presentation ?? {}), presentationId: course.presentationId }
                : base?.presentation ?? null,
            resourceCount: resources.length + (base?.resources?.length ?? 0),
            resources: [...(base?.resources ?? []), ...resources],
        };
    }

    #lessonSummary(slug) {
        const directory = path.join(this.lessonsRoot, slug);
        const lesson = readJson(path.join(directory, 'lesson.json'));
        if (!lesson) return null;
        const activities = readJson(path.join(directory, 'activities.json')) ?? [];
        const manifest = readJson(path.join(directory, 'package.manifest.json'));
        const presentation = readJson(path.join(directory, 'presentation', 'presentation.json'));
        return {
            courseId: manifest?.packageId ?? `lesson-package:${slug}`,
            kind: 'lesson-package',
            slug,
            title: lesson.title,
            lessonId: lesson.lessonId,
            version: lesson.version,
            baseLessonSlug: slug,
            runnable: true,
            metadata: lesson.metadata ?? {},
            activityCount: activities.length,
            activities: activities.map(item => ({ activityId: item.activityId, type: item.type, participantMode: item.participantMode, appletCount: item.applets?.length ?? 0 })),
            assets: lesson.assets ?? [],
            presentation: presentation ? { deckId: presentation.deckId, title: presentation.title } : null,
            resourceCount: lesson.assets?.length ?? 0,
            resources: lesson.assets ?? [],
        };
    }

    listCourses() {
        const builtIns = fs.readdirSync(this.lessonsRoot, { withFileTypes: true })
            .filter(entry => entry.isDirectory())
            .map(entry => this.#lessonSummary(entry.name))
            .filter(Boolean);
        const workspaces = fs.readdirSync(this.root, { withFileTypes: true })
            .filter(entry => entry.isDirectory())
            .map(entry => this.#summary(path.join(this.root, entry.name)))
            .filter(Boolean);
        return [...builtIns, ...workspaces].sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')) || a.title.localeCompare(b.title, 'zh-CN'));
    }

    getCourse(courseId) {
        const builtIn = this.listCourses().find(item => item.courseId === courseId);
        if (builtIn) return builtIn;
        return null;
    }

    createCourse({ title, baseLessonSlug }) {
        const cleanTitle = String(title ?? '').trim().slice(0, 160);
        if (!cleanTitle) throw new CourseLibraryError('course-title-required');
        const source = this.#lessonSummary(baseLessonSlug);
        if (!source) throw new CourseLibraryError('base-lesson-not-found');
        const baseSlug = safeSlug(cleanTitle);
        let slug = baseSlug;
        let index = 2;
        while (fs.existsSync(path.join(this.root, slug))) slug = `${baseSlug}-${index++}`;
        const directory = path.join(this.root, slug);
        fs.mkdirSync(path.join(directory, 'resources'), { recursive: true });
        const course = {
            courseId: `course:${slug}`,
            slug,
            title: cleanTitle,
            baseLessonSlug,
            status: 'draft',
            createdAt: now(),
            updatedAt: now(),
            presentationId: null,
            resources: [],
            capabilities: ['lesson-package', 'presentation', 'resource-file'],
        };
        fs.writeFileSync(path.join(directory, 'course.json'), JSON.stringify(course, null, 2));
        return this.#summary(directory);
    }

    addResource(courseId, { name, mimeType, bytes }) {
        const course = this.getCourse(courseId);
        if (!course || course.kind !== 'workspace') throw new CourseLibraryError('course-workspace-required');
        const source = Buffer.from(bytes);
        if (source.byteLength > MAX_RESOURCE_BYTES) throw new CourseLibraryError('course-resource-too-large');
        const directory = this.#workspacePath(courseId);
        const current = readJson(path.join(directory, 'course.json'));
        const resourceId = `resource:${crypto.randomUUID()}`;
        const fileName = safeFileName(name);
        const storageName = `${resourceId.slice('resource:'.length)}-${fileName}`;
        fs.writeFileSync(path.join(directory, 'resources', storageName), source);
        const record = { resourceId, name: fileName, mimeType: String(mimeType ?? 'application/octet-stream'), size: source.byteLength, storageName, createdAt: now() };
        const updated = { ...current, resources: [...(current.resources ?? []), record], updatedAt: now() };
        fs.writeFileSync(path.join(directory, 'course.json'), JSON.stringify(updated, null, 2));
        return { course: this.#summary(directory), resource: record };
    }

    attachPresentation(courseId, presentationId) {
        const course = this.getCourse(courseId);
        if (!course || course.kind !== 'workspace') throw new CourseLibraryError('course-workspace-required');
        const directory = this.#workspacePath(courseId);
        const current = readJson(path.join(directory, 'course.json'));
        const updated = { ...current, presentationId: String(presentationId), updatedAt: now() };
        fs.writeFileSync(path.join(directory, 'course.json'), JSON.stringify(updated, null, 2));
        return this.#summary(directory);
    }

    publishCourse(courseId) {
        const course = this.getCourse(courseId);
        if (!course || course.kind !== 'workspace') throw new CourseLibraryError('course-workspace-required');
        if (!course.baseLessonSlug) throw new CourseLibraryError('base-lesson-not-found');
        const directory = this.#workspacePath(courseId);
        const current = readJson(path.join(directory, 'course.json'));
        const updated = { ...current, status: 'published', publishedAt: now(), updatedAt: now() };
        fs.writeFileSync(path.join(directory, 'course.json'), JSON.stringify(updated, null, 2));
        return this.#summary(directory);
    }
}
