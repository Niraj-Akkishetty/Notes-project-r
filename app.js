/**
 * ═══════════════════════════════════════════════════════
 *  KeepNotes — Frontend Logic
 *  Google Keep Inspired | Dark Theme
 *  Storage: localStorage (works offline, no server needed)
 *  Also supports PHP API backend when available
 * ═══════════════════════════════════════════════════════
 */

const STORAGE_KEY = 'keepnotes_data';
const API_URL = 'api.php';

// ── DOM Helpers ─────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ── DOM Elements ────────────────────────────────────────
const collapsedBar     = $('#create-collapsed');
const expandedForm     = $('#create-expanded');
const createTitle      = $('#create-title');
const createContent    = $('#create-content');
const pinnedSection    = $('#pinned-section');
const pinnedGrid       = $('#pinned-grid');
const othersSection    = $('#others-section');
const othersGrid       = $('#others-grid');
const searchBar        = $('#search-bar');
const noteCountEl      = $('#note-count');
const modalOverlay     = $('#modal-overlay');
const modalTitle       = $('#modal-title');
const modalContent     = $('#modal-content');
const toastContainer   = $('#toast-container');

let allNotes = [];
let selectedColor = 'default';
let editingNoteId = null;
let editColor = 'default';
let searchTimeout = null;
let useAPI = false; // Auto-detected

// ── Color Palette ───────────────────────────────────────
const COLORS = [
    'default','coral','peach','sand','mint','sage',
    'fog','storm','dusk','blossom','clay','chalk'
];

// ═══════════════════════════════════════════════════════
//  LOCAL STORAGE BACKEND
// ═══════════════════════════════════════════════════════
class LocalStore {
    static _nextId() {
        const id = parseInt(localStorage.getItem('keepnotes_nextid') || '1');
        localStorage.setItem('keepnotes_nextid', String(id + 1));
        return id;
    }

    static getAll(search = '') {
        const raw = localStorage.getItem(STORAGE_KEY);
        let notes = raw ? JSON.parse(raw) : [];
        if (search) {
            const q = search.toLowerCase();
            notes = notes.filter(n =>
                (n.title || '').toLowerCase().includes(q) ||
                (n.content || '').toLowerCase().includes(q)
            );
        }
        // Sort: pinned first, then by updated_at desc
        notes.sort((a, b) => {
            if (a.pinned !== b.pinned) return b.pinned ? 1 : -1;
            return new Date(b.updated_at) - new Date(a.updated_at);
        });
        return notes;
    }

    static save(notes) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    }

    static create(title, content, color) {
        const notes = this.getAll();
        const now = new Date().toISOString();
        const note = {
            id: this._nextId(),
            title: title || '',
            content: content || '',
            color: color || 'default',
            pinned: false,
            created_at: now,
            updated_at: now
        };
        notes.unshift(note);
        this.save(notes);
        return note;
    }

    static update(id, title, content, color) {
        const notes = this.getAll();
        const idx = notes.findIndex(n => n.id === id);
        if (idx === -1) return null;
        notes[idx].title = title;
        notes[idx].content = content;
        notes[idx].color = color;
        notes[idx].updated_at = new Date().toISOString();
        this.save(notes);
        return notes[idx];
    }

    static togglePin(id) {
        const notes = this.getAll();
        const idx = notes.findIndex(n => n.id === id);
        if (idx === -1) return null;
        notes[idx].pinned = !notes[idx].pinned;
        notes[idx].updated_at = new Date().toISOString();
        this.save(notes);
        return notes[idx];
    }

    static delete(id) {
        let notes = this.getAll();
        notes = notes.filter(n => n.id !== id);
        this.save(notes);
        return true;
    }
}

// ═══════════════════════════════════════════════════════
//  INITIALIZATION
// ═══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
    // Try to detect if PHP API is available
    useAPI = await detectAPI();
    setupEventListeners();
    renderColorDots($('.create-note-footer .color-dots'), 'create');
    renderColorDots($('.modal-footer .color-dots'), 'edit');
    loadNotes();
});

async function detectAPI() {
    try {
        const res = await fetch(API_URL, { method: 'GET', signal: AbortSignal.timeout(1500) });
        return res.ok;
    } catch {
        return false;
    }
}

// ═══════════════════════════════════════════════════════
//  EVENT LISTENERS
// ═══════════════════════════════════════════════════════
function setupEventListeners() {
    // Expand create bar
    collapsedBar.addEventListener('click', expandCreateForm);

    // Close create form when clicking outside
    document.addEventListener('click', (e) => {
        if (expandedForm.classList.contains('active') &&
            !expandedForm.contains(e.target) &&
            !collapsedBar.contains(e.target)) {
            collapseCreateForm();
        }
    });

    // Save new note
    $('#btn-save').addEventListener('click', saveNewNote);

    // Close create form
    $('#btn-close-create').addEventListener('click', collapseCreateForm);

    // Search
    searchBar.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => loadNotes(searchBar.value.trim()), 200);
    });

    // Modal close
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });

    $('#btn-save-edit').addEventListener('click', saveEditedNote);
    $('#btn-close-modal').addEventListener('click', closeModal);
    $('#btn-delete-modal').addEventListener('click', () => {
        if (editingNoteId) deleteNote(editingNoteId);
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (modalOverlay.classList.contains('active')) closeModal();
            else if (expandedForm.classList.contains('active')) collapseCreateForm();
        }
    });
}

// ═══════════════════════════════════════════════════════
//  DATA OPERATIONS (auto-switch between API & local)
// ═══════════════════════════════════════════════════════
async function loadNotes(search = '') {
    try {
        if (useAPI) {
            const url = search ? `${API_URL}?search=${encodeURIComponent(search)}` : API_URL;
            const res = await fetch(url);
            if (!res.ok) throw new Error('API error');
            allNotes = await res.json();
        } else {
            allNotes = LocalStore.getAll(search);
        }
        renderNotes();
    } catch (err) {
        console.error('Load error:', err);
        // Fallback to local
        useAPI = false;
        allNotes = LocalStore.getAll(search);
        renderNotes();
    }
}

async function createNote(title, content, color) {
    try {
        let note;
        if (useAPI) {
            const res = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, content, color })
            });
            if (!res.ok) throw new Error('API error');
            note = await res.json();
        } else {
            note = LocalStore.create(title, content, color);
        }
        allNotes.unshift(note);
        renderNotes();
        showToast('✨ Note created');
    } catch (err) {
        console.error(err);
        showToast('⚠️ Failed to create note');
    }
}

async function updateNote(id, title, content, color) {
    try {
        let updated;
        if (useAPI) {
            const res = await fetch(API_URL, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, title, content, color })
            });
            if (!res.ok) throw new Error('API error');
            updated = await res.json();
        } else {
            updated = LocalStore.update(id, title, content, color);
        }
        const idx = allNotes.findIndex(n => n.id === id);
        if (idx !== -1) allNotes[idx] = updated;
        renderNotes();
        showToast('💾 Note saved');
    } catch (err) {
        console.error(err);
        showToast('⚠️ Failed to update note');
    }
}

async function togglePin(id) {
    try {
        let updated;
        if (useAPI) {
            const res = await fetch(`${API_URL}?action=toggle-pin`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            });
            if (!res.ok) throw new Error('API error');
            updated = await res.json();
        } else {
            updated = LocalStore.togglePin(id);
        }
        const idx = allNotes.findIndex(n => n.id === id);
        if (idx !== -1) allNotes[idx] = updated;
        renderNotes();
        showToast(updated.pinned ? '📌 Note pinned' : '📌 Note unpinned');
    } catch (err) {
        console.error(err);
        showToast('⚠️ Failed to toggle pin');
    }
}

async function deleteNote(id) {
    try {
        // Animate removal
        const card = document.querySelector(`.note-card[data-id="${id}"]`);
        if (card) {
            card.classList.add('removing');
            await new Promise(r => setTimeout(r, 280));
        }

        if (useAPI) {
            const res = await fetch(`${API_URL}?id=${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('API error');
        } else {
            LocalStore.delete(id);
        }

        allNotes = allNotes.filter(n => n.id !== id);
        if (modalOverlay.classList.contains('active')) closeModal();
        renderNotes();
        showToast('🗑️ Note deleted');
    } catch (err) {
        console.error(err);
        showToast('⚠️ Failed to delete note');
    }
}

// ═══════════════════════════════════════════════════════
//  RENDERING
// ═══════════════════════════════════════════════════════
function renderNotes() {
    const pinned = allNotes.filter(n => n.pinned);
    const others = allNotes.filter(n => !n.pinned);

    // Update count
    noteCountEl.textContent = `${allNotes.length} note${allNotes.length !== 1 ? 's' : ''}`;

    // Pinned section
    if (pinned.length > 0) {
        pinnedSection.style.display = 'block';
        pinnedGrid.innerHTML = pinned.map(noteCardHTML).join('');
    } else {
        pinnedSection.style.display = 'none';
        pinnedGrid.innerHTML = '';
    }

    // Others section
    if (others.length > 0) {
        othersSection.style.display = 'block';
        const label = pinned.length > 0 ? 'Others' : '';
        othersSection.querySelector('.section-label').textContent = label;
        othersGrid.innerHTML = others.map(noteCardHTML).join('');
    } else {
        othersSection.style.display = 'none';
        othersGrid.innerHTML = '';
    }

    // Empty state
    const emptyState = $('#empty-state');
    if (allNotes.length === 0) {
        emptyState.style.display = 'block';
        if (searchBar.value.trim()) {
            emptyState.querySelector('.empty-title').textContent = 'No matching notes';
            emptyState.querySelector('.empty-subtitle').textContent = 'Try a different search term';
            emptyState.querySelector('.empty-icon').textContent = '🔍';
        } else {
            emptyState.querySelector('.empty-title').textContent = 'No notes yet';
            emptyState.querySelector('.empty-subtitle').textContent = 'Click "Take a note..." to get started';
            emptyState.querySelector('.empty-icon').textContent = '📝';
        }
    } else {
        emptyState.style.display = 'none';
    }

    attachCardListeners();
}

function noteCardHTML(note) {
    const date = new Date(note.updated_at).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
    });
    const title = escapeHtml(note.title);
    const content = escapeHtml(note.content);

    return `
        <div class="note-card" data-id="${note.id}" data-color="${note.color}">
            ${title ? `<div class="note-title">${title}</div>` : ''}
            ${content ? `<div class="note-content">${content}</div>` : ''}
            <div class="note-meta">
                <span class="note-date">${date}</span>
                <div class="note-actions">
                    <button class="note-action-btn pin-btn ${note.pinned ? 'pinned' : ''}"
                            title="${note.pinned ? 'Unpin' : 'Pin'}" data-action="pin">
                        📌
                    </button>
                    <button class="note-action-btn delete-btn" title="Delete" data-action="delete">
                        🗑️
                    </button>
                </div>
            </div>
        </div>
    `;
}

function attachCardListeners() {
    $$('.note-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.closest('.note-action-btn')) return;
            openEditModal(parseInt(card.dataset.id));
        });

        card.querySelector('.pin-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            togglePin(parseInt(card.dataset.id));
        });

        card.querySelector('.delete-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteNote(parseInt(card.dataset.id));
        });
    });
}

// ═══════════════════════════════════════════════════════
//  CREATE FORM
// ═══════════════════════════════════════════════════════
function expandCreateForm() {
    collapsedBar.classList.add('hidden');
    expandedForm.classList.add('active');
    createTitle.focus();
}

function collapseCreateForm() {
    const title = createTitle.value.trim();
    const content = createContent.value.trim();
    if (title || content) {
        createNote(title, content, selectedColor);
    }

    createTitle.value = '';
    createContent.value = '';
    selectedColor = 'default';
    updateActiveColorDot('create');
    expandedForm.classList.remove('active');
    collapsedBar.classList.remove('hidden');
}

function saveNewNote() {
    const title = createTitle.value.trim();
    const content = createContent.value.trim();
    if (!title && !content) {
        showToast('⚠️ Write something first');
        return;
    }
    createNote(title, content, selectedColor);
    createTitle.value = '';
    createContent.value = '';
    selectedColor = 'default';
    updateActiveColorDot('create');
    expandedForm.classList.remove('active');
    collapsedBar.classList.remove('hidden');
}

// ═══════════════════════════════════════════════════════
//  EDIT MODAL
// ═══════════════════════════════════════════════════════
function openEditModal(noteId) {
    const note = allNotes.find(n => n.id === noteId);
    if (!note) return;

    editingNoteId = noteId;
    editColor = note.color;
    modalTitle.value = note.title;
    modalContent.value = note.content;

    // Set modal background
    const modal = $('.modal');
    const cssVar = getComputedStyle(document.documentElement)
        .getPropertyValue(`--note-${note.color}`).trim();
    modal.style.background = cssVar || '';

    updateActiveColorDot('edit');
    modalOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    modalTitle.focus();
}

function closeModal() {
    modalOverlay.classList.remove('active');
    document.body.style.overflow = '';
    // Reset modal bg
    $('.modal').style.background = '';
    editingNoteId = null;
}

function saveEditedNote() {
    if (!editingNoteId) return;
    const title = modalTitle.value.trim();
    const content = modalContent.value.trim();

    if (!title && !content) {
        deleteNote(editingNoteId);
        return;
    }

    updateNote(editingNoteId, title, content, editColor);
    closeModal();
}

// ═══════════════════════════════════════════════════════
//  COLOR DOTS
// ═══════════════════════════════════════════════════════
function renderColorDots(container, mode) {
    container.innerHTML = COLORS.map(c => `
        <div class="color-dot ${c === 'default' ? 'active' : ''}"
             data-color="${c}" data-mode="${mode}"
             title="${c.charAt(0).toUpperCase() + c.slice(1)}">
        </div>
    `).join('');

    container.querySelectorAll('.color-dot').forEach(dot => {
        dot.addEventListener('click', (e) => {
            e.stopPropagation();
            const color = dot.dataset.color;
            if (mode === 'create') {
                selectedColor = color;
            } else {
                editColor = color;
                const modal = $('.modal');
                const cssVar = getComputedStyle(document.documentElement)
                    .getPropertyValue(`--note-${color}`).trim();
                modal.style.background = cssVar || '';
            }
            updateActiveColorDot(mode);
        });
    });
}

function updateActiveColorDot(mode) {
    const activeColor = mode === 'create' ? selectedColor : editColor;
    $$(`.color-dot[data-mode="${mode}"]`).forEach(dot => {
        dot.classList.toggle('active', dot.dataset.color === activeColor);
    });
}

// ═══════════════════════════════════════════════════════
//  TOAST NOTIFICATIONS
// ═══════════════════════════════════════════════════════
function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 3000);
}

// ═══════════════════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════════════════
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
