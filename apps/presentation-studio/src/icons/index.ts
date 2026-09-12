/**
 * ClassCore Studio icon set.
 *
 * These are small, local SVG glyphs authored for the product surface. They
 * deliberately avoid a remote icon service, emoji, or a copied vendor icon
 * pack so the authoring surface remains usable on an offline classroom LAN.
 */
export type IconId =
    | 'save' | 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'delete' | 'duplicate'
    | 'new-slide' | 'text' | 'image' | 'shape' | 'table' | 'chart' | 'media'
    | 'align' | 'align-left' | 'align-center-horizontal' | 'align-right' | 'align-top' | 'align-middle' | 'align-bottom'
    | 'distribute' | 'distribute-horizontal' | 'distribute-vertical' | 'arrange' | 'bring-front' | 'bring-forward' | 'send-backward' | 'send-back'
    | 'group' | 'ungroup' | 'rotate' | 'rotate-left' | 'rotate-right' | 'flip-horizontal' | 'flip-vertical' | 'crop' | 'shape-outline' | 'replace-image'
    | 'alt-text' | 'background' | 'transition' | 'animation' | 'preview' | 'search'
    | 'replace' | 'selection-pane' | 'zoom-in' | 'zoom-out' | 'fit' | 'snapping'
    | 'guides' | 'notes' | 'publish' | 'rehearse' | 'more' | 'chevron-down'
    | 'chevron-right' | 'format-painter' | 'font' | 'font-family' | 'font-size' | 'bold' | 'italic' | 'underline' | 'strike'
    | 'paragraph' | 'bullet-list' | 'number-list' | 'indent' | 'line-spacing' | 'lock' | 'unlock' | 'hide' | 'show' | 'effects' | 'link';

const PATHS: Record<IconId, string> = {
    save: '<path d="M4 3h13l3 3v15H4z"/><path d="M7 3v6h9V3M7 21v-7h10v7"/>',
    undo: '<path d="M9 7 4 12l5 5"/><path d="M5 12h8a6 6 0 1 1 0 12"/>',
    redo: '<path d="m15 7 5 5-5 5"/><path d="M19 12h-8a6 6 0 1 0 0 12"/>',
    cut: '<circle cx="7" cy="7" r="3"/><circle cx="7" cy="17" r="3"/><path d="m9.5 9.5 9 9M9.5 14.5l9-9"/>',
    copy: '<rect x="8" y="8" width="11" height="12" rx="1"/><path d="M5 16H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
    paste: '<path d="M8 5h8M10 3h4v4h-4z"/><rect x="5" y="6" width="14" height="15" rx="2"/>',
    delete: '<path d="M4 6h16M9 6V3h6v3M7 6l1 15h8l1-15M10 10v7M14 10v7"/>',
    duplicate: '<rect x="6" y="6" width="12" height="13" rx="1"/><path d="M9 3h9a2 2 0 0 1 2 2v11M9 10h6M12 7v6"/>',
    'new-slide': '<rect x="3" y="4" width="14" height="16" rx="1"/><path d="M20 12v7M16.5 15.5h7M6 8h8M6 12h5"/>',
    text: '<path d="M4 5h16M12 5v14M8 19h8M7 5l-4 14M17 5l4 14"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m4 18 5-5 3 3 2-2 6 5"/>',
    shape: '<circle cx="8" cy="8" r="4"/><path d="m13 13 6 6M14 4h6v6M4 16h6v5H4z"/>',
    'shape-outline': '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 4v16M4 8h16"/>',
    table: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 10h18M3 15h18M9 4v16M15 4v16"/>',
    chart: '<path d="M4 20V4M4 20h17"/><path d="m7 16 4-5 3 3 5-7"/>',
    media: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z"/>',
    align: '<path d="M4 5h16M4 12h12M4 19h16"/>',
    'align-left': '<path d="M5 4v16M8 6h11M8 12h8M8 18h11"/>',
    'align-center-horizontal': '<path d="M12 4v16M6 7h12M8 12h8M6 17h12"/>',
    'align-right': '<path d="M19 4v16M5 6h11M8 12h8M5 18h11"/>',
    'align-top': '<path d="M4 5h16M6 8v11M12 8v8M18 8v11"/>',
    'align-middle': '<path d="M4 12h16M7 6v12M12 8v8M17 6v12"/>',
    'align-bottom': '<path d="M4 19h16M6 5v11M12 8v11M18 5v11"/>',
    distribute: '<path d="M4 4v16M12 7v10M20 4v16M6 12h4M14 12h4"/>',
    'distribute-horizontal': '<path d="M4 4v16M20 4v16M9 7h6M9 12h6M9 17h6"/><path d="M7 9 9 7l2 2M15 7l2 2-2 2M7 14l2-2 2 2M15 12l2 2-2 2"/>',
    'distribute-vertical': '<path d="M4 4h16M4 20h16M7 9v6M12 9v6M17 9v6"/><path d="M9 7 7 9l2 2M7 15l2 2 2-2M14 7l2 2-2 2M14 15l2 2 2-2"/>',
    arrange: '<rect x="4" y="4" width="10" height="10"/><rect x="10" y="10" width="10" height="10"/>',
    'bring-front': '<path d="M5 17h8M5 12h8M5 7h8M17 19V5M14 8l3-3 3 3"/>',
    'bring-forward': '<path d="M5 17h8M5 12h8M5 7h8M17 19V9M14 12l3-3 3 3"/>',
    'send-backward': '<path d="M5 17h8M5 12h8M5 7h8M17 5v10M14 12l3 3 3-3"/>',
    'send-back': '<path d="M5 17h8M5 12h8M5 7h8M17 5v14M14 16l3 3 3-3"/>',
    group: '<rect x="4" y="5" width="7" height="7"/><rect x="13" y="12" width="7" height="7"/><path d="M7 16h6M10 13v6"/>',
    ungroup: '<rect x="4" y="5" width="6" height="6"/><rect x="14" y="5" width="6" height="6"/><rect x="9" y="14" width="6" height="6"/>',
    rotate: '<path d="M5 9a7 7 0 1 1 2 8"/><path d="M5 4v5h5"/>',
    'rotate-left': '<path d="M19 9a7 7 0 1 0-2 8"/><path d="M19 4v5h-5"/>',
    'rotate-right': '<path d="M5 9a7 7 0 1 1 2 8"/><path d="M5 4v5h5"/>',
    'flip-horizontal': '<path d="M12 4v16M5 7l4 5-4 5M19 7l-4 5 4 5"/>',
    'flip-vertical': '<path d="M4 12h16M7 5l5 4 5-4M7 19l5-4 5 4"/>',
    crop: '<path d="M6 3v14a4 4 0 0 0 4 4h11M3 6h14a4 4 0 0 1 4 4v11"/>',
    'replace-image': '<rect x="3" y="5" width="13" height="14" rx="2"/><path d="m4 17 4-4 3 3 2-2 3 3M19 4v6M16 7l3-3 3 3"/>',
    'alt-text': '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 16c1-3 2-5 3-5s2 2 3 5M8 13h4M16 9h3M16 13h3"/>',
    background: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 15h16M8 4v16"/>',
    transition: '<path d="M4 5h16v14H4zM8 5v14M16 5v14"/><path d="m11 9 4 3-4 3z"/>',
    animation: '<path d="m13 3-9 11h7l-1 7 9-11h-7z"/>',
    preview: '<path d="m3 12 3-3 4 4 5-6 6 5"/><circle cx="12" cy="12" r="9"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    replace: '<path d="M4 7h12M4 12h8M4 17h12M17 12h4M19 10l2 2-2 2"/>',
    'selection-pane': '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 8h8M8 12h6M8 16h8"/>',
    'zoom-in': '<circle cx="10" cy="10" r="6"/><path d="M10 7v6M7 10h6M15 15l5 5"/>',
    'zoom-out': '<circle cx="10" cy="10" r="6"/><path d="M7 10h6M15 15l5 5"/>',
    fit: '<path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4"/><rect x="8" y="8" width="8" height="8"/>',
    snapping: '<path d="M4 4h16v16H4zM4 10h16M10 4v16"/>',
    guides: '<path d="M12 3v18M3 12h18"/><circle cx="12" cy="12" r="3"/>',
    notes: '<path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5"/>',
    publish: '<path d="M12 15V3M8 7l4-4 4 4M5 12v7h14v-7"/>',
    rehearse: '<path d="M5 4h14v16H5zM9 8l6 4-6 4z"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    'chevron-down': '<path d="m5 9 7 7 7-7"/>',
    'chevron-right': '<path d="m9 5 7 7-7 7"/>',
    'format-painter': '<path d="M4 4h12v6H4zM8 10v10M5 20h6M16 7h4v4h-4"/>',
    font: '<path d="M4 19 10 5h4l6 14M7 14h10"/>',
    'font-family': '<path d="M4 19 10 5h4l6 14M7 14h10"/><path d="M4 22h16"/>',
    'font-size': '<path d="M4 19 10 5h4l6 14M7 14h10"/><path d="M4 22h7M17 22h3"/>',
    bold: '<path d="M7 4h6a4 4 0 0 1 1 7.9A4.5 4.5 0 0 1 13 20H7zM7 12h5.5a4 4 0 0 0 0-8H7M7 12h6a4 4 0 0 1 0 8H7"/>',
    italic: '<path d="M10 4h8M6 20h8M14 4 10 20"/>',
    underline: '<path d="M7 4v7a5 5 0 0 0 10 0V4M5 20h14"/>',
    strike: '<path d="M5 9a5 5 0 0 1 9-3M19 15a5 5 0 0 1-9 3M4 12h16"/>',
    paragraph: '<path d="M5 5h14M5 10h14M5 15h10M5 20h14"/>',
    'bullet-list': '<circle cx="5" cy="6" r="1" fill="currentColor"/><circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="5" cy="18" r="1" fill="currentColor"/><path d="M9 6h10M9 12h10M9 18h10"/>',
    'number-list': '<path d="M4 5h2v4M4 9h3M4 12h3l-3 6h3M9 6h11M9 12h11M9 18h11"/>',
    indent: '<path d="M4 6h16M4 12h12M4 18h16M7 9l-3 3 3 3"/>',
    'line-spacing': '<path d="M6 5v14M3 8l3-3 3 3M3 16l3 3 3-3M13 6h7M13 12h7M13 18h7"/>',
    lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    unlock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 7-2"/>',
    hide: '<path d="M3 12s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6z"/><circle cx="12" cy="12" r="2"/><path d="M4 4l16 16"/>',
    show: '<path d="M3 12s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6z"/><circle cx="12" cy="12" r="2"/>',
    effects: '<path d="m12 3 2.2 5.1L20 10.3l-5.8 2.2L12 18l-2.2-5.5L4 10.3l5.8-2.2z"/><path d="m19 16 .8 1.8L22 18.6l-2.2.8 0 2.4-.8-1.6-2.2-.8 2.2-.8z"/>',
    link: '<path d="M10 13.5 14 9.5M7.5 16.5l-1 1a3.5 3.5 0 0 1-5-5l3-3a3.5 3.5 0 0 1 5 0M16.5 7.5l1-1a3.5 3.5 0 0 1 5 5l-3 3a3.5 3.5 0 0 1-5 0"/>',
};

export function createIcon(id: IconId, label = ''): SVGSVGElement {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('studio-icon', `studio-icon-${id}`);
    svg.innerHTML = PATHS[id];
    if (label) svg.setAttribute('data-icon-label', label);
    return svg;
}
