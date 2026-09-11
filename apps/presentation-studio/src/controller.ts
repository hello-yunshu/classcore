import type {
    AlignEdge,
    Command,
    EditAnimationStep,
    EditorChange,
    ElementId,
    ElementLayerTarget,
    ElementRecord,
    RunPropertyOverrides,
    Selection,
    SlideId,
    TextPosition,
    VectorFill,
} from '@web-ppt/edit-core';
import { copyElements } from '@web-ppt/edit-core';
import type { WebPptAdapter } from '@web-ppt/editor';
import type { WebPptPresentationAsset } from '@classroom/presentation-webppt-adapter';

export type ControllerListener = (change: EditorChange | null) => void;

/**
 * Product boundary for the web-ppt engine. Surface code talks to this class,
 * never to editor.exec directly. The document remains engine-owned and all
 * mutations stay undoable transactions in web-ppt.
 */
export class PresentationStudioController {
    private readonly listeners = new Set<ControllerListener>();
    private unsubscribeEditor: (() => void) | null = null;
    private clipboard: ReturnType<typeof import('@web-ppt/edit-core').copyElements> | null = null;

    constructor(private readonly adapter: WebPptAdapter) {}

    get snapshot() { return this.adapter.snapshot; }
    get session() { return this.adapter.snapshot.session; }
    get editor() { return this.session?.editor ?? null; }
    get slideId(): SlideId | null { return this.adapter.snapshot.slideId; }
    get selection(): Selection { return this.editor?.selection ?? { kind: 'none' }; }

    subscribe(listener: ControllerListener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    attachEditorSubscription(): void {
        this.unsubscribeEditor?.();
        this.unsubscribeEditor = this.editor?.subscribe((change: EditorChange) => {
            for (const listener of this.listeners) listener(change);
        }) ?? null;
    }

    execute(...commands: Command[]): boolean {
        const editor = this.requireEditor();
        editor.exec(...commands);
        return true;
    }

    select(selection: Selection): void { this.requireEditor().select(selection); }

    addSlide(): SlideId | null {
        const editor = this.requireEditor();
        const result = editor.exec({ type: 'AddSlide', layoutId: editor.doc.layoutOrder[0], at: { after: this.slideId } });
        return [...result.createdSlides][0] ?? null;
    }

    duplicateSlide(slideId: SlideId): SlideId | null {
        const result = this.requireEditor().exec({ type: 'DuplicateSlide', id: slideId });
        return [...result.createdSlides][0] ?? null;
    }

    moveSlide(slideId: SlideId, direction: -1 | 1): void {
        const order = this.requireEditor().doc.slideOrder;
        const index = order.indexOf(slideId);
        const target = index + direction;
        if (index < 0 || target < 0 || target >= order.length) return;
        this.execute({ type: 'MoveSlide', id: slideId, at: { after: target === 0 ? null : order[target - 1] } });
    }

    removeSlide(slideId: SlideId): void {
        if (this.requireEditor().doc.slideOrder.length > 1) this.execute({ type: 'RemoveSlide', id: slideId });
    }

    addShape(preset: string = 'roundRect'): ElementId | null {
        const slideId = this.requireSlide();
        const editor = this.requireEditor();
        editor.exec({ type: 'AddShape', slideId, preset, rect: { x: 320, y: 220, w: 240, h: 128 } });
        return editor.selection.kind === 'elements' ? editor.selection.ids[0] ?? null : null;
    }

    addTable(rows: number, cols: number): ElementId {
        const view = this.adapter.snapshot.view;
        if (view?.insertTable) return view.insertTable(rows, cols, { rect: { x: 180, y: 180, w: 600, h: 300 } });
        const editor = this.requireEditor();
        editor.exec({ type: 'AddTable', slideId: this.requireSlide(), rows, cols, rect: { x: 180, y: 180, w: 600, h: 300 } });
        const id = editor.selection.kind === 'elements' ? editor.selection.ids[0] : null;
        if (!id) throw new Error('web-ppt-table-id-missing');
        return id;
    }

    async addImage(file: Blob): Promise<ElementId> {
        const view = this.adapter.snapshot.view;
        if (!view?.insertImage) throw new Error('web-ppt-editor-view-not-ready');
        return view.insertImage(file, { rect: { x: 220, y: 150, w: 420, h: 300 } });
    }

    async setBackgroundImage(file: Blob): Promise<void> {
        const view = this.adapter.snapshot.view;
        if (!view?.setBackgroundImage) throw new Error('web-ppt-editor-view-not-ready');
        await view.setBackgroundImage(file);
    }

    removeSelected(): void {
        for (const id of this.selectedIds()) this.execute({ type: 'RemoveElement', id });
    }

    setTransform(id: ElementId, patch: { x?: number; y?: number; w?: number; h?: number; rot?: number }): void {
        this.execute({ type: 'SetXfrm', id, ...patch });
    }

    setFlip(id: ElementId, h?: boolean, v?: boolean): void { this.execute({ type: 'SetFlip', id, h, v }); }
    setLayer(id: ElementId, to: ElementLayerTarget): void { this.execute({ type: 'SetZ', id, to }); }
    align(ids: readonly ElementId[], edge: AlignEdge): void { if (ids.length > 1) this.execute({ type: 'AlignElements', ids, edge }); }
    setFill(id: ElementId, fill: VectorFill | null): void { this.execute({ type: 'SetFill', id, fill }); }
    setStroke(id: ElementId, stroke: { type: 'none' } | { color: string; width: number; dash: null; cap: 'butt'; join: 'miter'; compound: 'sng' } | null): void { this.execute({ type: 'SetStroke', id, stroke }); }
    setSlideBackground(id: SlideId, fill: VectorFill | null): void { this.execute({ type: 'SetBackground', id, fill }); }
    setAnimations(slideId: SlideId, steps: readonly EditAnimationStep[] | null): void { this.execute({ type: 'SetAnimations', slideId, steps }); }
    setNotes(id: SlideId, text: string): void { this.execute({ type: 'SetNotes', id, text }); }
    editText(id: ElementId, text: string): void {
        const record = this.requireEditor().doc.elements[id];
        const paragraphs = record?.src.text?.paragraphs ?? [];
        const lastParagraph = Math.max(0, paragraphs.length - 1);
        const lastRuns = paragraphs[lastParagraph]?.runs ?? [];
        const lastRun = Math.max(0, lastRuns.length - 1);
        const end: TextPosition = { p: lastParagraph, r: lastRun, off: lastRuns[lastRun]?.text.length ?? 0 };
        this.execute({ type: 'EditText', id, ops: [{ type: 'replace', from: { p: 0, r: 0, off: 0 }, to: end, text }] });
    }
    setTextStyle(id: ElementId, props: RunPropertyOverrides): void {
        const record = this.requireEditor().doc.elements[id];
        const paragraphs = record?.src.text?.paragraphs ?? [];
        const lastParagraph = Math.max(0, paragraphs.length - 1);
        const lastRuns = paragraphs[lastParagraph]?.runs ?? [];
        const lastRun = Math.max(0, lastRuns.length - 1);
        this.setRunProps(id, { from: { p: 0, r: 0, off: 0 }, to: { p: lastParagraph, r: lastRun, off: lastRuns[lastRun]?.text.length ?? 0 } }, props);
    }
    distributeHorizontal(ids: readonly ElementId[]): void {
        if (ids.length < 3) return;
        const editor = this.requireEditor();
        const records = ids.map(id => ({ id, element: editor.effectiveElement(id) })).sort((a, b) => a.element.x - b.element.x);
        const first = records[0].element.x;
        const last = records[records.length - 1].element.x + records[records.length - 1].element.w;
        const totalWidth = records.reduce((sum, item) => sum + item.element.w, 0);
        const gap = (last - first - totalWidth) / (records.length - 1);
        let x = first;
        for (const item of records) {
            this.setTransform(item.id, { x });
            x += item.element.w + gap;
        }
    }
    setRunProps(id: ElementId, range: { from: TextPosition; to: TextPosition }, props: RunPropertyOverrides): void { this.execute({ type: 'SetRunProps', id, range, props }); }

    copy(): boolean {
        const ids = this.selectedIds();
        if (!ids.length) return false;
        this.clipboard = copyElements(this.requireEditor().doc, ids);
        return true;
    }

    paste(x = 260, y = 190): boolean {
        if (!this.clipboard) return false;
        this.execute({ type: 'PasteElements', payload: this.clipboard, at: { parentId: this.requireSlide(), x, y } });
        return true;
    }

    selectedIds(): ElementId[] {
        const selection = this.selection;
        return selection.kind === 'elements' ? [...selection.ids] : [];
    }

    element(id: ElementId): ElementRecord | null { return this.editor?.doc.elements[id] ?? null; }

    async save(): Promise<Uint8Array> { return this.adapter.save(); }
    undo(): void { this.adapter.undo(); }
    redo(): void { this.adapter.redo(); }

    dispose(): void {
        this.unsubscribeEditor?.();
        this.unsubscribeEditor = null;
        this.adapter.dispose();
        this.listeners.clear();
    }

    private requireEditor() {
        if (!this.editor) throw new Error('web-ppt-editor-not-ready');
        return this.editor;
    }

    private requireSlide(): SlideId {
        const id = this.slideId ?? this.editor?.doc.slideOrder[0];
        if (!id) throw new Error('web-ppt-slide-not-ready');
        return id;
    }
}
