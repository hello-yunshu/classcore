import type {
    AlignEdge,
    Command,
    EditAnimationStep,
    EditorChange,
    ElementId,
    ElementLayerTarget,
    ElementRecord,
    RunPropertyOverrides,
    ParagraphPropertyOverrides,
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
        // Moving up targets the item before the destination; moving down must
        // land after the item that currently occupies the destination. Using
        // the same anchor for both directions makes A-down and B-up no-ops.
        const after = direction < 0
            ? (target === 0 ? null : order[target - 1])
            : order[target];
        this.execute({ type: 'MoveSlide', id: slideId, at: { after } });
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
    async replaceImage(file: Blob, id = this.selectedIds()[0]): Promise<ElementId> {
        const view = this.adapter.snapshot.view;
        if (!view || !id) throw new Error('web-ppt-image-selection-required');
        return view.replaceImage(file, { id });
    }

    async setBackgroundImage(file: Blob): Promise<void> {
        const view = this.adapter.snapshot.view;
        if (!view?.setBackgroundImage) throw new Error('web-ppt-editor-view-not-ready');
        await view.setBackgroundImage(file);
    }

    removeSelected(): void {
        const commands = this.selectedIds().map(id => ({ type: 'RemoveElement', id } as const));
        if (commands.length) this.execute(...commands);
    }

    cut(): void { if (this.copy()) this.removeSelected(); }

    selectAll(): void {
        const slideId = this.requireSlide();
        const ids = [...(this.requireEditor().doc.slides[slideId]?.children ?? [])];
        if (ids.length) this.select({ kind: 'elements', ids, enteredGroup: null });
    }

    setTransform(id: ElementId, patch: { x?: number; y?: number; w?: number; h?: number; rot?: number }): void {
        this.execute({ type: 'SetXfrm', id, ...patch });
    }

    setFlip(id: ElementId, h?: boolean, v?: boolean): void { this.execute({ type: 'SetFlip', id, h, v }); }
    setLayer(id: ElementId, to: ElementLayerTarget): void { this.execute({ type: 'SetZ', id, to }); }
    setLayerMany(ids: readonly ElementId[], to: ElementLayerTarget): void {
        if (ids.length) this.execute(...ids.map(id => ({ type: 'SetZ', id, to }) as const));
    }
    align(ids: readonly ElementId[], edge: AlignEdge): void { if (ids.length) this.execute({ type: 'AlignElements', ids, edge }); }
    setFill(id: ElementId, fill: VectorFill | null): void { this.execute({ type: 'SetFill', id, fill }); }
    setStroke(id: ElementId, stroke: { type: 'none' } | { color: string; width: number; dash: null; cap: 'butt'; join: 'miter'; compound: 'sng' } | null): void { this.execute({ type: 'SetStroke', id, stroke }); }
    setSlideBackground(id: SlideId, fill: VectorFill | null): void { this.execute({ type: 'SetBackground', id, fill }); }
    setAnimations(slideId: SlideId, steps: readonly EditAnimationStep[] | null): void { this.execute({ type: 'SetAnimations', slideId, steps }); }
    appendAnimations(slideId: SlideId, steps: readonly EditAnimationStep[]): void {
        if (!steps.length) return;
        const current = this.adapter.queryAnimations();
        if (current?.sourceReadonly) throw new Error('web-ppt-animation-source-readonly');
        this.execute({ type: 'SetAnimations', slideId, steps: [...(current?.value ?? []), ...steps] });
    }
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
        const commands = records.map(item => {
            const command = { type: 'SetXfrm', id: item.id, x } as const;
            x += item.element.w + gap;
            return command;
        });
        this.execute(...commands);
    }
    distributeVertical(ids: readonly ElementId[]): void {
        if (ids.length < 3) return;
        const editor = this.requireEditor();
        const records = ids.map(id => ({ id, element: editor.effectiveElement(id) })).sort((a, b) => a.element.y - b.element.y);
        const first = records[0].element.y;
        const last = records[records.length - 1].element.y + records[records.length - 1].element.h;
        const totalHeight = records.reduce((sum, item) => sum + item.element.h, 0);
        const gap = (last - first - totalHeight) / (records.length - 1);
        let y = first;
        const commands = records.map(item => { const command = { type: 'SetXfrm', id: item.id, y } as const; y += item.element.h + gap; return command; });
        this.execute(...commands);
    }
    rotate(id: ElementId | undefined, degrees: number): void {
        if (!id) return;
        const element = this.requireEditor().effectiveElement(id);
        this.setTransform(id, { rot: element.rot + degrees });
    }
    setRunProps(id: ElementId, range: { from: TextPosition; to: TextPosition }, props: RunPropertyOverrides): void { this.execute({ type: 'SetRunProps', id, range, props }); }
    toggleBold(): void { this.toggleRunProperty('b'); }
    toggleItalic(): void { this.toggleRunProperty('i'); }
    toggleUnderline(): void { this.toggleRunProperty('u'); }
    adjustFontSize(delta: number): void {
        const view = this.adapter.snapshot.view;
        const state = view?.queryRunProps();
        if (view && state?.size.value != null) view.setRunProps({ size: Math.max(1, state.size.value + delta) });
    }
    setParagraph(props: ParagraphPropertyOverrides): void { this.adapter.snapshot.view?.setParaProps(props); }
    private toggleRunProperty(property: 'b' | 'i' | 'u'): void {
        const view = this.adapter.snapshot.view;
        const state = view?.queryRunProps();
        if (view && state) view.setRunProps({ [property]: state[property].mixed || state[property].value !== true });
    }

    group(ids: readonly ElementId[]): void { if (ids.length >= 2) this.execute({ type: 'Group', ids }); }
    ungroup(id: ElementId): void { this.execute({ type: 'Ungroup', id }); }
    setLocked(id: ElementId, locked: boolean): void { this.execute({ type: 'SetLocked', id, locked }); }
    setHidden(id: ElementId, hidden: boolean): void { this.execute({ type: 'SetElementHidden', id, hidden }); }
    setName(id: ElementId, name: string): void { this.execute({ type: 'SetName', id, name }); }

    startFormatPainter(options?: Parameters<WebPptAdapter['startFormatPainter']>[0]): boolean { return this.adapter.startFormatPainter(options); }
    cancelFormatPainter(): void { this.adapter.cancelFormatPainter(); }
    openTextSearch(options?: Parameters<WebPptAdapter['openTextSearch']>[0]): void { this.adapter.openTextSearch(options); }
    closeTextSearch(): void { this.adapter.closeTextSearch(); }
    setTextSearchQuery(query: string): void { this.adapter.setTextSearchQuery(query); }
    setTextSearchReplacement(replacement: string): void { this.adapter.setTextSearchReplacement(replacement); }
    nextTextSearch(): ReturnType<WebPptAdapter['nextTextSearch']> { return this.adapter.nextTextSearch(); }
    previousTextSearch(): ReturnType<WebPptAdapter['previousTextSearch']> { return this.adapter.previousTextSearch(); }
    replaceCurrentText(): boolean { return this.adapter.replaceCurrentText(); }
    replaceAllText(): number { return this.adapter.replaceAllText(); }
    queryTransition(): ReturnType<WebPptAdapter['queryTransition']> { return this.adapter.queryTransition(); }
    setTransition(value: Parameters<WebPptAdapter['setTransition']>[0]): boolean { return this.adapter.setTransition(value); }
    previewTransition(value?: Parameters<WebPptAdapter['previewTransition']>[0]): ReturnType<WebPptAdapter['previewTransition']> { return this.adapter.previewTransition(value); }
    previewAnimations(value?: Parameters<WebPptAdapter['previewAnimations']>[0]): ReturnType<WebPptAdapter['previewAnimations']> { return this.adapter.previewAnimations(value); }
    startImageCrop(id?: ElementId): boolean { return this.adapter.snapshot.view?.startImageCrop(id) ?? false; }
    clearImageCrop(): void { this.selectedIds().forEach(id => this.execute({ type: 'SetCrop', id, crop: null })); }
    setLayoutFromFirst(): void { const view = this.adapter.snapshot.view; const layoutId = this.requireEditor().doc.layoutOrder[0]; if (view && layoutId) view.setLayout(layoutId); }
    setSnapping(snapping: boolean): void { this.adapter.setView({ snapping }); }
    setZoom(zoom: number): void { this.adapter.setView({ zoom }); }
    attachSelectionPane(container: HTMLElement | null): void { this.adapter.attachSelectionPane(container); }

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
