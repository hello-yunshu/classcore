import { createIcon, type IconId } from './icons/index.js';

export interface StudioCommand {
    id: string;
    label: string;
    shortLabel?: string;
    icon?: IconId;
    tooltip?: string;
    shortcut?: string;
    disabled?: boolean;
    checked?: boolean;
    danger?: boolean;
    execute(): void | Promise<void>;
}

export interface StudioMenuItem extends StudioCommand {
    submenu?: readonly StudioMenuItem[];
}

export type CommandDensity = 'icon-only' | 'compact' | 'large';

function commandTitle(command: StudioCommand): string {
    return [command.tooltip ?? command.label, command.shortcut].filter(Boolean).join(' · ');
}

export function createCommandButton(command: StudioCommand, density: CommandDensity = 'compact', extraClass = ''): HTMLButtonElement {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `command-button command-${density}${command.danger ? ' command-danger' : ''}${command.checked ? ' is-checked' : ''}${extraClass ? ` ${extraClass}` : ''}`;
    item.dataset.commandId = command.id;
    item.disabled = Boolean(command.disabled);
    item.title = commandTitle(command);
    item.setAttribute('aria-label', commandTitle(command));
    item.setAttribute('aria-pressed', String(Boolean(command.checked)));
    if (command.icon) item.append(createIcon(command.icon, command.label));
    if (density !== 'icon-only') {
        const text = document.createElement('span');
        text.className = 'command-label';
        text.textContent = command.shortLabel ?? command.label;
        item.append(text);
    }
    item.addEventListener('click', () => { if (!item.disabled) void command.execute(); });
    return item;
}

function focusableItems(menu: HTMLElement): HTMLButtonElement[] {
    return [...menu.querySelectorAll<HTMLButtonElement>(':scope > .command-menu-item:not(:disabled)')];
}

function closeMenu(menu: HTMLElement, restore: HTMLElement | null): void {
    menu.classList.remove('is-open');
    menu.querySelectorAll<HTMLElement>('.command-submenu.is-open').forEach(item => item.classList.remove('is-open'));
    if (restore) restore.focus();
}

function makeMenuItem(item: StudioMenuItem, owner: HTMLButtonElement): HTMLDivElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'command-menu-entry';
    const button = createCommandButton(item, 'compact', 'command-menu-item');
    button.setAttribute('role', 'menuitem');
    if (!item.submenu) wrapper.append(button);
    else {
        button.setAttribute('aria-haspopup', 'menu');
        button.setAttribute('aria-expanded', 'false');
        const chevron = createIcon('chevron-right', '展开');
        chevron.classList.add('menu-chevron');
        button.append(chevron);
        const submenu = document.createElement('div');
        submenu.className = 'command-menu command-submenu';
        submenu.setAttribute('role', 'menu');
        item.submenu.forEach(child => submenu.append(makeMenuItem(child, owner)));
        const open = () => {
            wrapper.parentElement?.querySelectorAll<HTMLElement>(':scope > .command-menu-entry > .command-submenu.is-open').forEach(other => other.classList.remove('is-open'));
            submenu.classList.add('is-open');
            button.setAttribute('aria-expanded', 'true');
            submenu.querySelector<HTMLButtonElement>('.command-menu-item')?.focus();
        };
        button.addEventListener('mouseenter', open);
        button.addEventListener('click', event => { event.preventDefault(); open(); });
        wrapper.append(button, submenu);
    }
    wrapper.addEventListener('keydown', event => {
        const root = owner.closest<HTMLElement>('.command-dropdown')?.querySelector<HTMLElement>('.command-menu.is-open');
        if (!root) return;
        const items = focusableItems(root);
        const index = items.indexOf(event.target as HTMLButtonElement);
        if (event.key === 'ArrowDown') { event.preventDefault(); items[(index + 1 + items.length) % items.length]?.focus(); }
        if (event.key === 'ArrowUp') { event.preventDefault(); items[(index - 1 + items.length) % items.length]?.focus(); }
        if (event.key === 'ArrowRight' && item.submenu) { event.preventDefault(); wrapper.querySelector<HTMLButtonElement>('.command-menu-item')?.click(); }
        if (event.key === 'ArrowLeft') { event.preventDefault(); wrapper.parentElement?.closest<HTMLElement>('.command-submenu')?.classList.remove('is-open'); owner.focus(); }
        if (event.key === 'Escape') { event.preventDefault(); closeMenu(owner.closest<HTMLElement>('.command-menu') ?? root, owner); }
    });
    return wrapper;
}

export function createDropdown(command: StudioCommand, items: readonly StudioMenuItem[]): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'command-dropdown';
    const trigger = createCommandButton(command, 'compact', 'command-dropdown-trigger');
    trigger.setAttribute('aria-haspopup', 'menu');
    trigger.setAttribute('aria-expanded', 'false');
    const chevron = createIcon('chevron-down', '展开');
    chevron.classList.add('dropdown-chevron');
    trigger.append(chevron);
    const menu = document.createElement('div');
    menu.className = 'command-menu';
    menu.setAttribute('role', 'menu');
    items.forEach(item => menu.append(makeMenuItem(item, trigger)));
    const toggle = () => {
        const open = !menu.classList.contains('is-open');
        menu.classList.toggle('is-open', open);
        trigger.setAttribute('aria-expanded', String(open));
        if (open) {
            const rect = trigger.getBoundingClientRect();
            menu.style.top = `${Math.round(rect.bottom + 5)}px`;
            menu.style.left = `${Math.round(rect.left)}px`;
            menu.querySelector<HTMLButtonElement>('.command-menu-item')?.focus();
        }
    };
    trigger.addEventListener('click', event => { event.stopPropagation(); toggle(); });
    trigger.addEventListener('keydown', event => { if (event.key === 'ArrowDown' || event.key === 'Enter') { event.preventDefault(); toggle(); } if (event.key === 'Escape') closeMenu(menu, trigger); });
    document.addEventListener('pointerdown', event => { if (!wrapper.contains(event.target as Node)) closeMenu(menu, null); });
    wrapper.append(trigger, menu);
    return wrapper;
}

export function createSplitButton(primary: StudioCommand, items: readonly StudioMenuItem[]): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'command-split';
    const main = createCommandButton(primary, 'compact', 'command-split-main');
    const menu = createDropdown({ ...primary, id: `${primary.id}:menu`, execute: () => undefined }, items);
    wrapper.append(main, menu);
    return wrapper;
}

export interface GalleryItem extends StudioCommand { preview?: string; }

export function createGallery(id: string, label: string, items: readonly GalleryItem[], columns = 6): HTMLElement {
    const section = document.createElement('div');
    section.className = 'command-gallery';
    section.dataset.galleryId = id;
    const grid = document.createElement('div');
    grid.className = 'gallery-grid';
    grid.style.setProperty('--gallery-columns', String(columns));
    grid.setAttribute('role', 'listbox');
    grid.setAttribute('aria-label', label);
    items.forEach(item => {
        // The preview is the gallery icon. Do not stack a second generic
        // command icon above it; that duplicate row makes the ribbon taller
        // without adding information.
        const button = createCommandButton({ ...item, icon: undefined }, 'compact', 'gallery-item');
        button.setAttribute('role', 'option');
        button.setAttribute('aria-selected', String(Boolean(item.checked)));
        if (item.preview) { const preview = document.createElement('span'); preview.className = `gallery-preview ${item.preview}`; button.prepend(preview); }
        grid.append(button);
    });
    section.append(grid);
    return section;
}
