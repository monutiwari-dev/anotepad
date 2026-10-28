// Global variables
let currentNoteId = null;
let autoSaveInterval = null;
let notes = [];
let filteredNotes = [];
let currentUserEmail = null; // Track if user is logged in

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    initializeTheme();
    initializeEditor();
    setupEventListeners();
    startAutoSave();
    // Register Service Worker for PWA
    registerServiceWorker();
    // Setup PWA install prompt
    setupPWAInstall();
    // Setup offline detection
    setupOfflineDetection();
    // Check if user is signed in, then restore last note
    checkUserSignInStatus().then(() => {
        // Show local storage notification if not logged in
        showLocalStorageNotification();
        // Load notes and folders after a short delay to ensure DOM is ready
        setTimeout(() => {
            loadNotes();
            loadFolders();
            // Restore last opened note after loading notes
            restoreLastOpenedNote();
        }, 100);
    });
    
    // Save content before page unload
    window.addEventListener('beforeunload', (e) => {
        // Save current note immediately before unload
        if (currentNoteId || document.getElementById('noteEditor')?.innerHTML.trim()) {
            // Try to save synchronously if possible
            const editor = document.getElementById('noteEditor');
            const titleInput = document.getElementById('noteTitle');
            if (editor && titleInput) {
                const content = editor.innerHTML;
                const title = titleInput.value;
                
                // Save current note ID
                if (currentNoteId) {
                    localStorage.setItem('anotepad_last_note_id', currentNoteId);
                }
                
                // Save content as backup
                if (content.trim() || title.trim() !== 'Untitled Document') {
                    localStorage.setItem('anotepad_last_note_content', JSON.stringify({
                        id: currentNoteId,
                        title: title,
                        content: content
                    }));
                }
                
                // For non-logged-in users, ensure notes are saved to localStorage
                if (!currentUserEmail) {
                    try {
                        const localNotes = localStorage.getItem('anotepad_notes');
                        let notesArray = [];
                        if (localNotes) {
                            notesArray = JSON.parse(localNotes);
                        }
                        
                        // Update or add current note
                        if (currentNoteId) {
                            const noteIndex = notesArray.findIndex(n => n.id === currentNoteId);
                            if (noteIndex !== -1) {
                                notesArray[noteIndex] = {
                                    ...notesArray[noteIndex],
                                    title: title,
                                    content: content,
                                    updated_at: new Date().toISOString()
                                };
                            } else if (content.trim() || title.trim() !== 'Untitled Document') {
                                // Add as new note if it doesn't exist
                                const newNote = {
                                    id: currentNoteId,
                                    title: title,
                                    content: content,
                                    preview: (editor.innerText || editor.textContent || '').substring(0, 100),
                                    is_pinned: 0,
                                    is_archived: 0,
                                    is_deleted: 0,
                                    folder_id: null,
                                    created_at: new Date().toISOString(),
                                    updated_at: new Date().toISOString()
                                };
                                notesArray.unshift(newNote);
                            }
                        } else if (content.trim() || title.trim() !== 'Untitled Document') {
                            // Create new note if we have content but no ID
                            const newId = 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                            const newNote = {
                                id: newId,
                                title: title,
                                content: content,
                                preview: (editor.innerText || editor.textContent || '').substring(0, 100),
                                is_pinned: 0,
                                is_archived: 0,
                                is_deleted: 0,
                                folder_id: null,
                                created_at: new Date().toISOString(),
                                updated_at: new Date().toISOString()
                            };
                            notesArray.unshift(newNote);
                            localStorage.setItem('anotepad_last_note_id', newId);
                        }
                        
                        // Save updated notes array
                        localStorage.setItem('anotepad_notes', JSON.stringify(notesArray));
                    } catch (error) {
                        console.error('Error saving notes on unload:', error);
                    }
                }
            }
        }
    });
});

// Show notification about local storage for non-logged-in users
function showLocalStorageNotification() {
    // Check if notification was already shown today
    const lastShown = localStorage.getItem('anotepad_local_notification_date');
    const today = new Date().toDateString();
    
    if (!currentUserEmail && lastShown !== today) {
        setTimeout(() => {
            showNotification('You are using local storage. Sign in to sync notes across devices.', 'info');
            localStorage.setItem('anotepad_local_notification_date', today);
        }, 2000);
    }
}

// Register Service Worker for PWA
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            // Use relative path to work in subdirectories
            const swPath = './service-worker.js';
            navigator.serviceWorker.register(swPath, { scope: './' })
                .then((registration) => {
                    console.log('[PWA] Service Worker registered successfully:', registration.scope);
                    
                    // Check for updates
                    registration.addEventListener('updatefound', () => {
                        const newWorker = registration.installing;
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                // New service worker available, prompt user to refresh
                                showNotification('New version available! Reload to update.', 'info');
                                setTimeout(() => {
                                    if (confirm('New version available! Reload to update?')) {
                                        window.location.reload();
                                    }
                                }, 2000);
                            }
                        });
                    });
                })
                .catch((error) => {
                    console.error('[PWA] Service Worker registration failed:', error);
                });
            
            // Listen for service worker updates
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                console.log('[PWA] Service Worker controller changed');
            });
        });
    } else {
        console.log('[PWA] Service Workers are not supported in this browser');
    }
}

// PWA Install Prompt
let deferredPrompt;
let installButton = null;

function setupPWAInstall() {
    // Create install button if it doesn't exist
    if (!installButton) {
        installButton = document.createElement('button');
        installButton.id = 'pwaInstallBtn';
        installButton.innerHTML = '<i class="fas fa-download"></i> Install App';
        installButton.className = 'header-btn';
        installButton.style.display = 'none';
        installButton.title = 'Install aNotepad as PWA';
        installButton.addEventListener('click', installPWA);
        
        // Add to header (before sign in button)
        const headerRight = document.querySelector('.header-right');
        if (headerRight) {
            const signInBtn = document.getElementById('signInBtn');
            if (signInBtn) {
                headerRight.insertBefore(installButton, signInBtn);
            } else {
                headerRight.appendChild(installButton);
            }
        }
    }
    
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches || 
        window.navigator.standalone === true) {
        // Already installed
        if (installButton) installButton.style.display = 'none';
        return;
    }
    
    // Listen for beforeinstallprompt event
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        if (installButton) {
            installButton.style.display = 'block';
        }
    });
    
    // Listen for app installed
    window.addEventListener('appinstalled', () => {
        console.log('[PWA] App installed');
        deferredPrompt = null;
        if (installButton) {
            installButton.style.display = 'none';
        }
        showNotification('App installed successfully!', 'success');
    });
}

function installPWA() {
    if (!deferredPrompt) {
        showNotification('Installation not available', 'info');
        return;
    }
    
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
            console.log('[PWA] User accepted install prompt');
            showNotification('Installing app...', 'info');
        } else {
            console.log('[PWA] User dismissed install prompt');
        }
        deferredPrompt = null;
        if (installButton) {
            installButton.style.display = 'none';
        }
    });
}

// Offline Detection
function setupOfflineDetection() {
    // Update online status
    function updateOnlineStatus() {
        if (navigator.onLine) {
            showNotification('Back online', 'success');
        } else {
            showNotification('You are offline. Some features may be limited.', 'info');
        }
    }
    
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    
    // Initial check
    if (!navigator.onLine) {
        showNotification('You are offline. Some features may be limited.', 'info');
    }
}

// Check user sign-in status
async function checkUserSignInStatus() {
    try {
        const response = await fetch('auth.php', {
            method: 'GET',
            credentials: 'include'
        });
        const result = await response.json();
        if (result.success && result.user) {
            currentUserEmail = result.user.email;
            updateSignInUI(result.user);
        } else {
            currentUserEmail = null;
            updateSignInUI(null);
        }
    } catch (error) {
        console.error('Error checking sign-in status:', error);
        currentUserEmail = null;
        updateSignInUI(null);
    }
    // Return promise for chaining
    return Promise.resolve();
}

// Update sign-in UI
function updateSignInUI(user) {
    const signInBtn = document.getElementById('signInBtn');
    const userMenuContainer = document.getElementById('userMenuContainer');
    const userName = document.getElementById('userName');
    const userEmailDisplay = document.getElementById('userEmailDisplay');
    const noteFolderContainer = document.getElementById('noteFolderContainer');
    const folderToggleBtn = document.getElementById('folderToggleBtn');
    
    if (user) {
        // Hide sign in button, show user menu
        if (signInBtn) {
            signInBtn.style.display = 'none';
        }
        if (userMenuContainer) {
            userMenuContainer.style.display = 'flex';
            if (userName) {
                userName.textContent = user.name || user.email.split('@')[0];
            }
            if (userEmailDisplay) {
                userEmailDisplay.textContent = user.email;
            }
        }
        // Show folder controls for logged-in users
        if (noteFolderContainer) {
            noteFolderContainer.style.display = 'none'; // Hidden by default, can be toggled
        }
        if (folderToggleBtn) {
            folderToggleBtn.style.display = 'block';
        }
    } else {
        // Show sign in button, hide user menu
        if (signInBtn) {
            signInBtn.style.display = 'block';
            signInBtn.innerHTML = 'Sign in';
            signInBtn.title = 'Sign In';
        }
        if (userMenuContainer) {
            userMenuContainer.style.display = 'none';
        }
        // Hide folder controls for non-logged-in users
        if (noteFolderContainer) {
            noteFolderContainer.style.display = 'none';
        }
        if (folderToggleBtn) {
            folderToggleBtn.style.display = 'none';
        }
    }
}

// Sign out function
async function handleSignOut() {
    try {
        const response = await fetch('auth.php', {
            method: 'DELETE',
            credentials: 'include'
        });
        const result = await response.json();
        
        if (result.success) {
            currentUserEmail = null;
            updateSignInUI(null);
            showNotification('Signed out successfully', 'success');
            // Clear notes and folders
            notes = [];
            folders = [];
            filteredNotes = [];
            currentNoteId = null;
            document.getElementById('noteTitle').value = '';
            document.getElementById('noteEditor').innerHTML = '';
            // Load local storage notes if any
            loadNotes();
            displayFolders();
        }
    } catch (error) {
        console.error('Sign out error:', error);
        showNotification('Error signing out', 'error');
    }
}

// Theme Management
function initializeTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
    const icon = document.querySelector('#themeToggle i');
    icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
}

// Editor Initialization
function initializeEditor() {
    const editor = document.getElementById('noteEditor');
    
    // Set placeholder
    editor.addEventListener('focus', () => {
        if (editor.textContent.trim() === '') {
            editor.innerHTML = '';
            editor.removeAttribute('data-placeholder');
        }
    });

    editor.addEventListener('blur', () => {
        if (editor.textContent.trim() === '') {
            editor.setAttribute('data-placeholder', 'Start writing, press "/" for commands...');
        }
    });

    // Update word count
    editor.addEventListener('input', updateWordCount);
    
    // Prevent paste of unwanted content
    editor.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text');
        document.execCommand('insertText', false, text);
    });
}

// Word Count
function updateWordCount() {
    const editor = document.getElementById('noteEditor');
    const text = editor.innerText || editor.textContent;
    const words = text.trim().split(/\s+/).filter(word => word.length > 0);
    const chars = text.length;
    
    // Update word count display
    const wordCountEl = document.getElementById('wordCount');
    const charCountEl = document.getElementById('charCount');
    if (wordCountEl) wordCountEl.textContent = `Words: ${words.length}`;
    if (charCountEl) charCountEl.textContent = `Characters: ${chars}`;
}

// Mobile Menu Toggle
function toggleMobileMenu() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    
    console.log('Toggle mobile menu - sidebar:', sidebar, 'overlay:', overlay);
    
    if (sidebar && overlay) {
        const isOpen = sidebar.classList.contains('open');
        console.log('Sidebar is currently:', isOpen ? 'open' : 'closed');
        
        if (isOpen) {
            sidebar.classList.remove('open');
            overlay.classList.remove('active');
            document.body.style.overflow = '';
            console.log('Closing mobile menu');
        } else {
            sidebar.classList.add('open');
            overlay.classList.add('active');
            document.body.style.overflow = 'hidden';
            console.log('Opening mobile menu - sidebar classes:', sidebar.className, 'overlay classes:', overlay.className);
        }
    } else {
        console.error('Sidebar or overlay not found!', { sidebar, overlay });
    }
}

function closeMobileMenu() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    
    if (sidebar && overlay) {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// Event Listeners
function setupEventListeners() {
    // Mobile menu toggle
    const mobileMenuToggle = document.getElementById('mobileMenuToggle');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    
    if (mobileMenuToggle) {
        mobileMenuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMobileMenu();
        });
    }
    
    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', closeMobileMenu);
    }
    
    // Close mobile menu when clicking on nav items (mobile only)
    const handleNavClick = () => {
        if (window.innerWidth <= 768) {
            setTimeout(closeMobileMenu, 300);
        }
    };
    
    const navItems = document.querySelectorAll('.nav-item, .sidebar-nav a, .folders-list a');
    navItems.forEach(item => {
        item.addEventListener('click', handleNavClick);
    });
    
    // Handle window resize
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (window.innerWidth > 768) {
                closeMobileMenu();
            }
        }, 250);
    });
    
    // Theme toggle
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);
    
    // Help button (keyboard shortcuts)
    document.getElementById('helpBtn').addEventListener('click', showShortcutsModal);
    
    // New note
    document.getElementById('newNoteBtn').addEventListener('click', (e) => {
        e.preventDefault();
        setActiveNavItem(e.currentTarget);
        createNewNote();
    });
    
    // All notes button
    document.getElementById('allNotesBtn').addEventListener('click', (e) => {
        e.preventDefault();
        setActiveNavItem(e.currentTarget);
        currentFilter = 'all';
        selectedFolderId = null;
        loadNotesWithFilter('all', null);
        openNotesModal();
        if (window.innerWidth <= 768) {
            setTimeout(closeMobileMenu, 300);
        }
    });
    
    
    // More dropdown
    const moreBtn = document.getElementById('moreBtn');
    const moreMenu = document.getElementById('moreMenu');
    const moreDropdown = document.getElementById('moreDropdown');
    
    if (moreBtn) {
        moreBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Toggle dropdown
            const isOpen = moreMenu.style.display === 'block';
            if (isOpen) {
                moreMenu.style.display = 'none';
                moreDropdown.classList.remove('active');
            } else {
                moreMenu.style.display = 'block';
                moreDropdown.classList.add('active');
            }
        });
    }
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (moreDropdown && !moreDropdown.contains(e.target)) {
            moreMenu.style.display = 'none';
            moreDropdown.classList.remove('active');
        }
    });
    
    // More menu items
    document.getElementById('aboutMenuItem')?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        moreMenu.style.display = 'none';
        moreDropdown.classList.remove('active');
        window.location.href = 'about.html';
    });
    
    document.getElementById('termsMenuItem')?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        moreMenu.style.display = 'none';
        moreDropdown.classList.remove('active');
        window.location.href = 'terms.html';
    });
    
    document.getElementById('privacyMenuItem')?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        moreMenu.style.display = 'none';
        moreDropdown.classList.remove('active');
        window.location.href = 'privacy.html';
    });
    
    document.getElementById('contactMenuItem')?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        moreMenu.style.display = 'none';
        moreDropdown.classList.remove('active');
        window.location.href = 'contact.html';
    });
    
    
    // Close modal
    document.getElementById('closeModal').addEventListener('click', closeNotesModal);
    
    // Click outside modal to close
    document.getElementById('notesModal').addEventListener('click', (e) => {
        if (e.target.id === 'notesModal') {
            closeNotesModal();
        }
    });
    
    // Delete button
    document.getElementById('deleteBtn').addEventListener('click', deleteNote);
    
    // Duplicate button
    document.getElementById('duplicateBtn').addEventListener('click', duplicateNote);
    
    // Fullscreen button
    document.getElementById('fullscreenBtn').addEventListener('click', toggleFullscreen);
    
    // Upload doc button
    document.getElementById('uploadDocBtn').addEventListener('click', () => {
        document.getElementById('importFileInput').click();
    });
    
    document.getElementById('importFileInput').addEventListener('change', importNote);
    
    // Toolbar buttons
    document.querySelectorAll('.toolbar-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const command = btn.dataset.command;
            const value = btn.dataset.value;
            
            if (command === 'createLink') {
                createLink();
            } else if (command === 'code') {
                // Handle code formatting
                formatCode();
            } else if (command === 'undo' || command === 'redo') {
                document.execCommand(command, false, null);
                updateToolbarState();
            } else if (command === 'fontSize' && value) {
                // Font size adjustment
                adjustFontSize(parseInt(value));
            } else if (command) {
                document.execCommand(command, false, null);
                updateToolbarState();
            }
        });
    });
    
    // Font family change
    document.getElementById('fontFamily').addEventListener('change', (e) => {
        const fontFamily = e.target.value;
        document.execCommand('fontName', false, fontFamily);
        updateToolbarState();
    });
    
    // Paragraph style button
    document.getElementById('paragraphStyleBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        showParagraphStyleMenu(e.currentTarget);
    });
    
    // Search in modal
    document.getElementById('searchInput').addEventListener('input', filterNotes);
    
    // Create debounced save functions
    const debouncedSaveTitle = debounce(saveNote, 1000);
    const debouncedSaveEditor = debounce(saveNote, 2000);
    
    // Title input
    document.getElementById('noteTitle').addEventListener('input', (e) => {
        debouncedSaveTitle();
    });
    
    // Editor input
    document.getElementById('noteEditor').addEventListener('input', () => {
        updateWordCount();
        debouncedSaveEditor();
    });
    
    // Editor placeholder handling
    const editor = document.getElementById('noteEditor');
    editor.addEventListener('focus', () => {
        if (editor.textContent.trim() === '') {
            editor.innerHTML = '';
        }
    });
    
    editor.addEventListener('blur', () => {
        if (editor.textContent.trim() === '') {
            editor.setAttribute('data-placeholder', 'Start writing, press "/" for commands...');
        }
    });
    
    // Text color button
    document.getElementById('textColorBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        showColorPicker('text');
    });
    
    // Highlight color button
    document.getElementById('highlightColorBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        showColorPicker('highlight');
    });
    
    // Case button
    document.getElementById('caseBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        showCaseMenu(e.currentTarget);
    });
    
    // Insert button
    document.getElementById('insertBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        showInsertMenu(e.currentTarget);
    });
    
    // Align button
    document.getElementById('alignBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        showAlignMenu(e.currentTarget);
    });
    
    // Update toolbar state on selection change
    editor.addEventListener('mouseup', updateToolbarState);
    editor.addEventListener('keyup', updateToolbarState);
    editor.addEventListener('selectionchange', updateToolbarState);
    
    // Keyboard shortcuts
    setupKeyboardShortcuts();
    
    // Shortcuts modal
    document.getElementById('closeShortcutsModal')?.addEventListener('click', () => {
        document.getElementById('shortcutsModal').classList.remove('active');
    });
    
    // Share modal event listeners
    // Version history button
    document.getElementById('versionHistoryBtn')?.addEventListener('click', openVersionHistory);
    
    // Version history modal event listeners
    document.getElementById('closeVersionHistoryModal')?.addEventListener('click', closeVersionHistory);
    
    // Close version history modal on outside click
    document.getElementById('versionHistoryModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'versionHistoryModal') {
            closeVersionHistory();
        }
    });
    
    // Share modal password toggle
    document.getElementById('sharePasswordEnabled')?.addEventListener('change', (e) => {
        const passwordInput = document.getElementById('sharePassword');
        passwordInput.style.display = e.target.checked ? 'block' : 'none';
        if (!e.target.checked) {
            passwordInput.value = '';
        }
    });
    
    // Share modal expiry toggle
    document.getElementById('shareExpiryEnabled')?.addEventListener('change', (e) => {
        const expiryInput = document.getElementById('shareExpiryDate');
        expiryInput.style.display = e.target.checked ? 'block' : 'none';
        if (!e.target.checked) {
            expiryInput.value = '';
        } else {
            // Set minimum date to today
            const now = new Date();
            now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
            expiryInput.min = now.toISOString().slice(0, 16);
        }
    });
    
    // Close shortcuts modal on outside click
    document.getElementById('shortcutsModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'shortcutsModal') {
            document.getElementById('shortcutsModal').classList.remove('active');
        }
    });
    
    // Close folder modal on outside click
    document.getElementById('folderModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'folderModal') {
            closeFolderModal();
        }
    });
    
}

// Set active nav item
function setActiveNavItem(item) {
    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
    if (item) item.classList.add('active');
}

// Toolbar State
function updateToolbarState() {
    const selection = window.getSelection();
    
    // Update formatting buttons
    document.querySelectorAll('.toolbar-btn').forEach(btn => {
        const command = btn.dataset.command;
        if (command) {
            try {
                // Some commands don't support queryCommandState
                if (['bold', 'italic', 'underline'].includes(command)) {
                    const isActive = document.queryCommandState(command);
                    btn.classList.toggle('active', isActive);
                } else if (command === 'code') {
                    // Check if selection is in a code element
                    if (selection.rangeCount > 0) {
                        const node = selection.anchorNode;
                        const codeElement = node.nodeType === 3 
                            ? node.parentElement.closest('code, pre')
                            : node.closest('code, pre');
                        btn.classList.toggle('active', !!codeElement);
                    }
                } else if (command === 'insertUnorderedList' || command === 'insertOrderedList') {
                    const isActive = document.queryCommandState(command);
                    btn.classList.toggle('active', isActive);
                }
            } catch (e) {
                // Ignore errors for unsupported commands
            }
        }
    });
    
    // Update font size display
    if (selection.rangeCount > 0) {
        try {
            const range = selection.getRangeAt(0);
            let element = range.commonAncestorContainer;
            if (element.nodeType === Node.TEXT_NODE) {
                element = element.parentElement;
            }
            
            // Find element with font size
            while (element && element !== document.getElementById('noteEditor')) {
                const fontSize = window.getComputedStyle(element).fontSize;
                if (fontSize && fontSize !== '16px') {
                    const size = parseInt(fontSize);
                    const sizeDisplay = document.querySelector('.font-size-display');
                    if (sizeDisplay) {
                        sizeDisplay.textContent = size;
                    }
                    break;
                }
                element = element.parentElement;
            }
        } catch (e) {
            // Ignore errors
        }
    }
}

// Format Code
function formatCode() {
    const editor = document.getElementById('noteEditor');
    editor.focus();
    
    const selection = window.getSelection();
    if (selection.rangeCount === 0) {
        // Ensure selection is in editor
        const range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
    }
    
    const range = selection.getRangeAt(0);
    
    // Check if already in code element
    let codeElement = null;
    if (range.commonAncestorContainer) {
        const node = range.commonAncestorContainer;
        codeElement = node.nodeType === Node.TEXT_NODE 
            ? node.parentElement.closest('code')
            : node.closest('code');
    }
    
    if (codeElement) {
        // Unwrap code
        const parent = codeElement.parentNode;
        while (codeElement.firstChild) {
            parent.insertBefore(codeElement.firstChild, codeElement);
        }
        parent.removeChild(codeElement);
        updateToolbarState();
        return;
    }
    
    if (range.collapsed) {
        // Insert code element at cursor
        const code = document.createElement('code');
        code.textContent = 'code';
        range.insertNode(code);
        // Select the inserted text
        range.selectNodeContents(code);
        selection.removeAllRanges();
        selection.addRange(range);
    } else {
        // Wrap selected text in code tags
        const selectedText = selection.toString();
        const code = document.createElement('code');
        code.textContent = selectedText;
        range.deleteContents();
        range.insertNode(code);
        // Select the code element
        range.selectNodeContents(code);
        selection.removeAllRanges();
        selection.addRange(range);
    }
    updateToolbarState();
}

// Adjust Font Size
function adjustFontSize(delta) {
    const editor = document.getElementById('noteEditor');
    editor.focus();
    
    const selection = window.getSelection();
    if (selection.rangeCount === 0) {
        // Ensure selection is in editor
        const range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
    }
    
    const range = selection.getRangeAt(0);
    
    if (range.collapsed) {
        // No selection - apply to current paragraph/block
        let element = range.commonAncestorContainer;
        if (element.nodeType === Node.TEXT_NODE) {
            element = element.parentElement;
        }
        
        // Find block element
        while (element && element !== editor && !['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'SPAN'].includes(element.tagName)) {
            element = element.parentElement;
        }
        
        if (element && element !== editor) {
            const currentSize = parseInt(window.getComputedStyle(element).fontSize) || 16;
            const newSize = Math.max(8, Math.min(72, currentSize + delta));
            element.style.fontSize = newSize + 'px';
            const sizeDisplay = document.querySelector('.font-size-display');
            if (sizeDisplay) {
                sizeDisplay.textContent = newSize;
            }
        } else {
            // Apply to editor default
            const currentSize = 16;
            const newSize = Math.max(8, Math.min(72, currentSize + delta));
            editor.style.fontSize = newSize + 'px';
            const sizeDisplay = document.querySelector('.font-size-display');
            if (sizeDisplay) {
                sizeDisplay.textContent = newSize;
            }
        }
    } else {
        // Has selection - apply to selected text
        const selectedText = selection.toString();
        const span = document.createElement('span');
        
        // Get current font size from selection
        let currentSize = 16;
        try {
            const parent = range.commonAncestorContainer;
            const element = parent.nodeType === Node.TEXT_NODE ? parent.parentElement : parent;
            const fontSize = window.getComputedStyle(element).fontSize;
            if (fontSize) {
                currentSize = parseInt(fontSize) || 16;
            }
        } catch (e) {}
        
        const newSize = Math.max(8, Math.min(72, currentSize + delta));
        span.style.fontSize = newSize + 'px';
        span.textContent = selectedText;
        
        range.deleteContents();
        range.insertNode(span);
        
        // Update display
        const sizeDisplay = document.querySelector('.font-size-display');
        if (sizeDisplay) {
            sizeDisplay.textContent = newSize;
        }
        
        // Select the new span
        range.selectNodeContents(span);
        selection.removeAllRanges();
        selection.addRange(range);
    }
    updateToolbarState();
}

// Create Link
function createLink() {
    const selection = window.getSelection();
    if (selection.rangeCount === 0 || selection.isCollapsed) {
        showNotification('Please select text to create a link', 'info');
        return;
    }
    
    const url = prompt('Enter URL:');
    if (url && url.trim()) {
        // Remove http:// or https:// if not present, add it
        let linkUrl = url.trim();
        if (!linkUrl.match(/^https?:\/\//i)) {
            linkUrl = 'https://' + linkUrl;
        }
        document.execCommand('createLink', false, linkUrl);
        updateToolbarState();
        showNotification('Link created successfully', 'success');
    }
}

// Insert Image
function insertImage() {
    const url = prompt('Enter image URL:');
    if (url && url.trim()) {
        const img = document.createElement('img');
        img.src = url.trim();
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
        img.style.display = 'block';
        img.style.margin = '1rem 0';
        img.onerror = function() {
            showNotification('Failed to load image. Please check the URL.', 'error');
            this.remove();
        };
        
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            range.insertNode(img);
            // Move cursor after image
            range.setStartAfter(img);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
        } else {
            const editor = document.getElementById('noteEditor');
            editor.appendChild(img);
            // Move cursor after image
            const newRange = document.createRange();
            newRange.setStartAfter(img);
            newRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(newRange);
        }
        updateToolbarState();
    }
}

// Create New Note
function createNewNote() {
    // Add animation
    const editor = document.getElementById('noteEditor');
    editor.style.opacity = '0';
    editor.style.transform = 'translateY(10px)';
    
    setTimeout(() => {
        currentNoteId = null;
        // Clear last note ID so it doesn't restore on reload
        localStorage.removeItem('anotepad_last_note_id');
        localStorage.removeItem('anotepad_last_note_content');
        const newTitle = 'Untitled Document';
        const newContent = '';
        
        document.getElementById('noteTitle').value = newTitle;
        document.getElementById('noteEditor').innerHTML = newContent;
        
        // Reset last saved content
        lastSavedContent = newContent;
        lastSavedTitle = newTitle;
        
        updateWordCount();
        document.getElementById('noteEditor').setAttribute('data-placeholder', 'Start writing, press "/" for commands...');
        document.getElementById('noteTitle').focus();
        
        editor.style.transition = 'all 0.3s ease';
        editor.style.opacity = '1';
        editor.style.transform = 'translateY(0)';
    }, 150);
    
    showNotification('New note created', 'info');
}

// Save Note function is defined later with full feature support (tags, folders, etc.)

// Load Notes
async function loadNotes() {
    // Preserve existing notes in case of error
    const previousNotes = [...notes];
    
    // If user is not logged in, load from localStorage
    if (!currentUserEmail) {
        try {
            const localNotes = localStorage.getItem('anotepad_notes');
            if (localNotes) {
                const parsedNotes = JSON.parse(localNotes);
                if (Array.isArray(parsedNotes) && parsedNotes.length > 0) {
                    notes = parsedNotes;
                    filteredNotes = [...notes];
                    displayNotes();
                    // Update pinned notes dropdown if it's open
                    const pinnedMenu = document.getElementById('pinnedNotesMenu');
                    if (pinnedMenu && pinnedMenu.style.display === 'block') {
                        loadPinnedNotesDropdown();
                    }
                } else {
                    // Only clear if we're sure there are no notes
                    if (previousNotes.length === 0) {
                        notes = [];
                        filteredNotes = [];
                        displayNotes();
                    }
                }
            } else {
                // Only clear if we had no previous notes
                if (previousNotes.length === 0) {
                    notes = [];
                    filteredNotes = [];
                    displayNotes();
                }
            }
        } catch (error) {
            console.error('Error loading notes from localStorage:', error);
            // Preserve previous notes on error
            if (previousNotes.length > 0) {
                notes = previousNotes;
                filteredNotes = [...previousNotes];
                displayNotes();
                showNotification('Error loading notes. Showing cached notes.', 'warning');
            } else {
                notes = [];
                filteredNotes = [];
                displayNotes();
            }
        }
        return;
    }
    
    // User is logged in - load from server
    try {
        const response = await fetch('load.php?action=list', {
            credentials: 'include',
            cache: 'no-cache'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            const serverNotes = result.notes || [];
            // Only update if we got valid notes or if we had no previous notes
            if (Array.isArray(serverNotes)) {
                notes = serverNotes;
                folders = result.folders || folders;
                filteredNotes = [...notes];
                displayNotes();
                // Update pinned notes dropdown if it's open
                const pinnedMenu = document.getElementById('pinnedNotesMenu');
                if (pinnedMenu && pinnedMenu.style.display === 'block') {
                    loadPinnedNotesDropdown();
                }
            } else if (previousNotes.length > 0) {
                // Keep previous notes if server returned invalid data
                notes = previousNotes;
                filteredNotes = [...previousNotes];
                displayNotes();
                showNotification('Error loading notes from server. Showing cached notes.', 'warning');
            }
        } else {
            // Server returned error but we have previous notes - keep them
            if (previousNotes.length > 0) {
                notes = previousNotes;
                filteredNotes = [...previousNotes];
                displayNotes();
                showNotification('Error loading notes: ' + (result.message || 'Unknown error'), 'warning');
            } else {
                notes = [];
                filteredNotes = [];
                displayNotes();
            }
        }
    } catch (error) {
        console.error('Error loading notes:', error);
        // Preserve previous notes on network error
        if (previousNotes.length > 0) {
            notes = previousNotes;
            filteredNotes = [...previousNotes];
            displayNotes();
            showNotification('Network error. Showing cached notes. Check your connection.', 'warning');
        } else {
            // Only clear if we had no previous notes
            notes = [];
            filteredNotes = [];
            displayNotes();
        }
    }
}

// Load Pinned Notes for Dropdown
function loadPinnedNotesDropdown() {
    const pinnedList = document.getElementById('pinnedNotesList');
    const pinnedMenu = document.getElementById('pinnedNotesMenu');
    const pinnedDropdown = document.getElementById('pinnedNotesDropdown');
    const pinnedBtn = document.getElementById('pinnedNotesBtn');
    
    if (!pinnedList) return;
    
    const pinnedNotes = notes.filter(note => note.is_pinned && !note.is_deleted);
    
    if (pinnedNotes.length === 0) {
        pinnedList.innerHTML = `
            <div class="dropdown-empty">
                <svg class="pin-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="opacity: 0.3; margin-bottom: 0.5rem;">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="currentColor"/>
                </svg>
                <p style="font-size: 0.875rem; color: var(--text-secondary);">No pinned notes</p>
            </div>
        `;
        return;
    }
    
    pinnedList.innerHTML = pinnedNotes.slice(0, 10).map(note => {
        return `
            <div class="pinned-note-item" data-id="${note.id}">
                <div class="pinned-note-title">${escapeHtml(note.title)}</div>
                <div class="pinned-note-preview">${escapeHtml((note.preview || 'No content').substring(0, 50))}${(note.preview || '').length > 50 ? '...' : ''}</div>
            </div>
        `;
    }).join('');
    
    // Add click listeners
    pinnedList.querySelectorAll('.pinned-note-item').forEach(item => {
        item.addEventListener('click', () => {
            const id = item.dataset.id;
            loadNote(id);
            if (pinnedMenu) pinnedMenu.style.display = 'none';
            if (pinnedDropdown) pinnedDropdown.classList.remove('active');
        });
    });
    
    // Show count if more than 10
    if (pinnedNotes.length > 10) {
        const moreItem = document.createElement('div');
        moreItem.className = 'pinned-note-more';
        moreItem.innerHTML = `<span>+${pinnedNotes.length - 10} more pinned notes</span>`;
        moreItem.addEventListener('click', (e) => {
            e.stopPropagation();
            if (pinnedBtn) setActiveNavItem(pinnedBtn);
            currentFilter = 'pinned';
            loadNotesWithFilter('filter', 'pinned');
            openNotesModal();
            if (pinnedMenu) pinnedMenu.style.display = 'none';
            if (pinnedDropdown) pinnedDropdown.classList.remove('active');
        });
        pinnedList.appendChild(moreItem);
    }
}

// Display Notes - This function is overridden later with enhanced features
// Keeping as placeholder for compatibility
function displayNotes() {
    const notesList = document.getElementById('notesList');
    if (!notesList) return;
    
    if (filteredNotes.length === 0) {
        notesList.innerHTML = `
            <div style="text-align: center; padding: 3rem; color: var(--text-secondary);">
                <i class="fas fa-sticky-note" style="font-size: 3rem; opacity: 0.3; margin-bottom: 1rem;"></i>
                <p>No notes found</p>
                <p style="font-size: 0.9rem; margin-top: 0.5rem; opacity: 0.7;">Create your first note to get started!</p>
            </div>
        `;
        return;
    }
    
    notesList.innerHTML = filteredNotes.map((note, index) => `
        <div class="note-item ${note.id == currentNoteId ? 'active' : ''}" data-id="${note.id}">
            <div class="note-item-title">${escapeHtml(note.title)}</div>
            <div class="note-item-preview">${escapeHtml(note.preview || 'No content')}</div>
            <div class="note-item-date">${formatDate(note.created_at)}</div>
        </div>
    `).join('');
    
    // Add click listeners
    notesList.querySelectorAll('.note-item').forEach(item => {
        item.addEventListener('click', () => {
            const id = item.dataset.id;
            loadNote(id);
            closeNotesModal();
        });
    });
}

// Load Note
async function loadNote(id) {
    try {
        // Add loading state
        const editor = document.getElementById('noteEditor');
        editor.style.opacity = '0.5';
        editor.style.pointerEvents = 'none';
        
        // If user is not logged in, load from localStorage
        if (!currentUserEmail) {
            const localNotes = localStorage.getItem('anotepad_notes');
            if (localNotes) {
                const notes = JSON.parse(localNotes);
                const note = notes.find(n => n.id === id);
                if (note) {
                    currentNoteId = note.id;
                    document.getElementById('noteTitle').value = note.title;
                    
                    setTimeout(() => {
                        document.getElementById('noteEditor').innerHTML = note.content;
                        editor.style.transition = 'all 0.3s ease';
                        editor.style.opacity = '1';
                        editor.style.pointerEvents = 'auto';
                        updateWordCount();
                        displayNotes();
                    }, 200);
                    return;
                }
            }
            editor.style.opacity = '1';
            editor.style.pointerEvents = 'auto';
            showNotification('Note not found', 'error');
            return;
        }
        
        // User is logged in - load from server
        const response = await fetch(`load.php?action=single&id=${id}`);
        const result = await response.json();
        
        if (result.success && result.note) {
            currentNoteId = result.note.id;
            document.getElementById('noteTitle').value = result.note.title;
            
            // Animate content change
            setTimeout(() => {
                document.getElementById('noteEditor').innerHTML = result.note.content;
                editor.style.transition = 'all 0.3s ease';
                editor.style.opacity = '1';
                editor.style.pointerEvents = 'auto';
                updateWordCount();
                displayNotes();
            }, 200);
        } else {
            editor.style.opacity = '1';
            editor.style.pointerEvents = 'auto';
        }
    } catch (error) {
        console.error('Error loading note:', error);
        showNotification('Error loading note', 'error');
        document.getElementById('noteEditor').style.opacity = '1';
        document.getElementById('noteEditor').style.pointerEvents = 'auto';
    }
}

// Delete Note
async function deleteNote() {
    if (!currentNoteId) {
        clearEditor();
        return;
    }
    
    if (!confirm('Are you sure you want to delete this note?')) {
        return;
    }
    
    // If user is not logged in, delete from localStorage
    if (!currentUserEmail) {
        try {
            const localNotes = localStorage.getItem('anotepad_notes');
            if (localNotes) {
                let notes = JSON.parse(localNotes);
                notes = notes.filter(n => n.id !== currentNoteId);
                localStorage.setItem('anotepad_notes', JSON.stringify(notes));
                showNotification('Note deleted successfully', 'success');
                createNewNote();
                loadNotes();
            }
        } catch (error) {
            console.error('Error deleting note from localStorage:', error);
            showNotification('Error deleting note', 'error');
        }
        return;
    }
    
    // User is logged in - delete from server
    try {
        const formData = new FormData();
        formData.append('id', currentNoteId);
        
        const response = await fetch('delete.php', {
            method: 'POST',
            body: formData,
            credentials: 'include'
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification('Note deleted successfully', 'success');
            createNewNote();
            loadNotes();
        } else {
            showNotification('Error deleting note: ' + result.message, 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('Error deleting note', 'error');
    }
}

// Clear Editor
function clearEditor() {
    if (confirm('Clear all content? This cannot be undone.')) {
        document.getElementById('noteEditor').innerHTML = '';
        updateWordCount();
    }
}

// Filter Notes
function filterNotes() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    filteredNotes = notes.filter(note => 
        note.title.toLowerCase().includes(searchTerm) ||
        (note.preview && note.preview.toLowerCase().includes(searchTerm))
    );
    displayNotes();
}

// Export Note
function exportNote() {
    const title = document.getElementById('noteTitle').value.trim() || 'Untitled Note';
    const content = document.getElementById('noteEditor').innerHTML;
    const textContent = document.getElementById('noteEditor').innerText || document.getElementById('noteEditor').textContent;
    
    if (!textContent.trim()) {
        alert('Nothing to export');
        return;
    }
    
    // Create HTML export
    const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${escapeHtml(title)}</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.6; }
    </style>
</head>
<body>
    <h1>${escapeHtml(title)}</h1>
    ${content}
</body>
</html>`;
    
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9]/gi, '_')}.html`;
    a.click();
    URL.revokeObjectURL(url);
    
    showNotification('Note exported successfully!', 'success');
}

// Duplicate Note
function duplicateNote() {
    const title = document.getElementById('noteTitle').value.trim() || 'Untitled Note';
    const content = document.getElementById('noteEditor').innerHTML;
    const textContent = document.getElementById('noteEditor').innerText || document.getElementById('noteEditor').textContent;
    
    if (!textContent.trim() && title.trim() === 'Untitled Note') {
        showNotification('Nothing to duplicate', 'info');
        return;
    }
    
    // Create a new note with duplicated content
    const newTitle = title + ' (Copy)';
    document.getElementById('noteTitle').value = newTitle;
    
    // Save as new note
    currentNoteId = null;
    saveNote().then(() => {
        showNotification('Note duplicated successfully!', 'success');
    });
}

// Copy to Clipboard Helper
function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(err => {
            console.error('Failed to copy:', err);
        });
    } else {
        // Fallback
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
    }
}

// Version History Functions
function openVersionHistory() {
    if (!currentNoteId) {
        showNotification('Please open a note to view version history', 'info');
        return;
    }
    
    const modal = document.getElementById('versionHistoryModal');
    if (modal) {
        modal.classList.add('active');
        loadVersionHistory();
    }
}

function closeVersionHistory() {
    const modal = document.getElementById('versionHistoryModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

function loadVersionHistory() {
    if (!currentNoteId) return;
    
    const loadingDiv = document.getElementById('versionHistoryLoading');
    const emptyDiv = document.getElementById('versionHistoryEmpty');
    const timelineDiv = document.getElementById('versionHistoryTimeline');
    const container = document.getElementById('versionTimelineContainer');
    
    loadingDiv.style.display = 'block';
    emptyDiv.style.display = 'none';
    timelineDiv.style.display = 'none';
    container.innerHTML = '';
    
    // If user is not logged in or note is from local storage, load from localStorage
    if (!currentUserEmail || (currentNoteId && currentNoteId.toString().startsWith('local_'))) {
        try {
            const localVersions = localStorage.getItem(`anotepad_versions_${currentNoteId}`);
            loadingDiv.style.display = 'none';
            
            if (localVersions) {
                const versions = JSON.parse(localVersions);
                // Format versions for display
                const formattedVersions = versions.map(v => ({
                    ...v,
                    formatted_date: formatDateForVersion(v.created_at),
                    relative_date: getRelativeTimeForVersion(v.created_at),
                    preview: generatePreviewForVersion(v.content, 150)
                }));
                
                if (formattedVersions.length > 0) {
                    displayVersionHistory(formattedVersions);
                    timelineDiv.style.display = 'block';
                } else {
                    emptyDiv.style.display = 'block';
                }
            } else {
                emptyDiv.style.display = 'block';
            }
        } catch (error) {
            console.error('Error loading version history from localStorage:', error);
            loadingDiv.style.display = 'none';
            emptyDiv.style.display = 'block';
        }
        return;
    }
    
    // User is logged in - load from server
    fetch(`versions.php?note_id=${currentNoteId}`)
        .then(response => response.json())
        .then(data => {
            loadingDiv.style.display = 'none';
            
            if (data.success && data.versions && data.versions.length > 0) {
                displayVersionHistory(data.versions);
                timelineDiv.style.display = 'block';
            } else {
                emptyDiv.style.display = 'block';
            }
        })
        .catch(error => {
            console.error('Error loading version history:', error);
            loadingDiv.style.display = 'none';
            emptyDiv.style.display = 'block';
            showNotification('Error loading version history', 'error');
        });
}

// Helper function to format date for version history
function formatDateForVersion(dateString) {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()];
    const day = date.getDate();
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${month} ${day}, ${year} ${hours}:${minutes}`;
}

// Helper function to get relative time for version history
function getRelativeTimeForVersion(dateString) {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) {
        const minutes = Math.floor(diff / 60000);
        return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    }
    if (diff < 86400000) {
        const hours = Math.floor(diff / 3600000);
        return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    }
    if (diff < 604800000) {
        const days = Math.floor(diff / 86400000);
        return `${days} day${days > 1 ? 's' : ''} ago`;
    }
    if (diff < 2592000000) {
        const weeks = Math.floor(diff / 604800000);
        return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
    }
    if (diff < 31536000000) {
        const months = Math.floor(diff / 2592000000);
        return `${months} month${months > 1 ? 's' : ''} ago`;
    }
    const years = Math.floor(diff / 31536000000);
    return `${years} year${years > 1 ? 's' : ''} ago`;
}

// Helper function to generate preview for version
function generatePreviewForVersion(content, length = 150) {
    const div = document.createElement('div');
    div.innerHTML = content;
    const text = div.textContent || div.innerText || '';
    const cleanText = text.trim();
    if (cleanText.length > length) {
        return cleanText.substring(0, length) + '...';
    }
    return cleanText || 'No content';
}

function displayVersionHistory(versions) {
    const container = document.getElementById('versionTimelineContainer');
    container.innerHTML = '';
    
    versions.forEach((version, index) => {
        const versionItem = document.createElement('div');
        versionItem.className = 'version-item';
        versionItem.style.cssText = 'padding: 1rem; margin-bottom: 1rem; background: var(--bg-secondary); border-radius: 8px; border-left: 3px solid var(--primary-color); position: relative;';
        
        const isCurrent = index === 0;
        
        versionItem.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
                <div style="flex: 1;">
                    <div style="font-weight: 600; margin-bottom: 0.25rem; color: var(--text-primary);">
                        ${isCurrent ? '<i class="fas fa-circle" style="color: var(--primary-color); font-size: 0.5rem; margin-right: 0.5rem;"></i>' : ''}
                        ${escapeHtml(version.title)}
                    </div>
                    <div style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.5rem;">
                        ${version.relative_date} • ${version.formatted_date}
                    </div>
                    <div style="font-size: 0.875rem; color: var(--text-secondary); line-height: 1.4;">
                        ${escapeHtml(version.preview)}
                    </div>
                </div>
            </div>
            <div style="display: flex; gap: 0.5rem; margin-top: 0.75rem;">
                <button class="view-version-btn" data-id="${version.id}" 
                        style="padding: 0.5rem 1rem; background: var(--bg-tertiary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; cursor: pointer; font-size: 0.875rem;">
                    <i class="fas fa-eye"></i> Preview
                </button>
                ${!isCurrent ? `
                <button class="restore-version-btn" data-id="${version.id}" 
                        style="padding: 0.5rem 1rem; background: var(--primary-color); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.875rem;">
                    <i class="fas fa-undo"></i> Restore
                </button>
                ` : '<span style="padding: 0.5rem 1rem; background: var(--primary-color); color: white; border-radius: 4px; font-size: 0.875rem; opacity: 0.7;">Current Version</span>'}
            </div>
        `;
        
        container.appendChild(versionItem);
    });
    
    // Add event listeners
    container.querySelectorAll('.view-version-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const versionId = e.target.closest('.view-version-btn').dataset.id;
            viewVersion(versionId, versions);
        });
    });
    
    container.querySelectorAll('.restore-version-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const versionId = e.target.closest('.restore-version-btn').dataset.id;
            restoreVersion(versionId, versions);
        });
    });
}

function viewVersion(versionId, versions) {
    const version = versions.find(v => v.id == versionId);
    if (!version) return;
    
    // Create preview modal
    const previewModal = document.createElement('div');
    previewModal.className = 'notes-modal';
    previewModal.style.cssText = 'display: flex; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.5); z-index: 2000; align-items: center; justify-content: center;';
    previewModal.innerHTML = `
        <div class="modal-content" style="max-width: 800px; max-height: 80vh; overflow-y: auto;">
            <div class="modal-header">
                <h2><i class="fas fa-eye"></i> Version Preview - ${escapeHtml(version.title)}</h2>
                <button class="modal-close" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: var(--text-secondary);">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body">
                <div style="color: var(--text-secondary); margin-bottom: 1rem; font-size: 0.875rem;">
                    ${version.formatted_date} • ${version.relative_date}
                </div>
                <div style="padding: 1rem; background: var(--bg-secondary); border-radius: 4px; min-height: 200px;">
                    ${version.content}
                </div>
                <div style="margin-top: 1rem; text-align: right;">
                    <button class="btn-secondary" style="margin-right: 0.5rem;">Close</button>
                    <button class="btn-primary restore-from-preview" data-id="${version.id}">
                        <i class="fas fa-undo"></i> Restore This Version
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(previewModal);
    
    // Close handlers
    previewModal.querySelector('.modal-close').addEventListener('click', () => {
        document.body.removeChild(previewModal);
    });
    
    previewModal.querySelector('.btn-secondary').addEventListener('click', () => {
        document.body.removeChild(previewModal);
    });
    
    previewModal.querySelector('.restore-from-preview').addEventListener('click', () => {
        document.body.removeChild(previewModal);
        restoreVersion(versionId, versions);
    });
    
    previewModal.addEventListener('click', (e) => {
        if (e.target === previewModal) {
            document.body.removeChild(previewModal);
        }
    });
}

async function restoreVersion(versionId, versions) {
    const version = versions.find(v => v.id == versionId);
    if (!version) return;
    
    if (!confirm(`Are you sure you want to restore this version? This will replace the current content of the note.`)) {
        return;
    }
    
    // Update the editor with the restored version
    document.getElementById('noteTitle').value = version.title;
    document.getElementById('noteEditor').innerHTML = version.content;
    updateWordCount();
    
    // Save the restored version (this will create a new version automatically)
    try {
        const saved = await saveNote();
        if (saved) {
            showNotification('Version restored successfully!', 'success');
            // Reload version history to update the list
            loadVersionHistory();
        } else {
            showNotification('Error restoring version', 'error');
        }
    } catch (error) {
        console.error('Error restoring version:', error);
        showNotification('Error restoring version', 'error');
    }
}

// Helper function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Save version to localStorage
function saveVersionToLocalStorage(noteId, title, content, createdAt) {
    try {
        const versionKey = `anotepad_versions_${noteId}`;
        let versions = [];
        
        const stored = localStorage.getItem(versionKey);
        if (stored) {
            versions = JSON.parse(stored);
        }
        
        // Create new version
        const newVersion = {
            id: 'version_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            note_id: noteId,
            title: title,
            content: content,
            created_at: createdAt || new Date().toISOString()
        };
        
        // Add to beginning (most recent first)
        versions.unshift(newVersion);
        
        // Limit to 50 versions per note
        if (versions.length > 50) {
            versions = versions.slice(0, 50);
        }
        
        // Save to localStorage
        localStorage.setItem(versionKey, JSON.stringify(versions));
    } catch (error) {
        console.error('Error saving version to localStorage:', error);
    }
}

// Calculate similarity between two strings (percentage)
function calculateSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    if (str1 === str2) return 100;
    
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 100;
    
    // Simple similarity calculation based on common characters
    let matches = 0;
    const maxLength = Math.max(str1.length, str2.length);
    
    for (let i = 0; i < shorter.length; i++) {
        if (str1[i] === str2[i]) {
            matches++;
        }
    }
    
    // Also check for common substrings
    const commonChars = countCommonChars(str1, str2);
    const similarity = ((matches + commonChars) / (maxLength * 2)) * 100;
    
    return Math.min(100, Math.max(0, similarity));
}

// Count common characters between two strings
function countCommonChars(str1, str2) {
    const chars1 = str1.split('').sort();
    const chars2 = str2.split('').sort();
    let common = 0;
    let i = 0, j = 0;
    
    while (i < chars1.length && j < chars2.length) {
        if (chars1[i] === chars2[j]) {
            common++;
            i++;
            j++;
        } else if (chars1[i] < chars2[j]) {
            i++;
        } else {
            j++;
        }
    }
    
    return common;
}

// Copy Note to Clipboard
function copyNoteToClipboard() {
    const title = document.getElementById('noteTitle').value.trim() || 'Untitled Note';
    const textContent = document.getElementById('noteEditor').innerText || document.getElementById('noteEditor').textContent;
    
    const textToCopy = `${title}\n\n${textContent}`;
    
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(textToCopy).then(() => {
            showNotification('Note copied to clipboard!', 'success');
        }).catch(() => {
            // Fallback method
            fallbackCopyToClipboard(textToCopy);
        });
    } else {
        fallbackCopyToClipboard(textToCopy);
    }
}

// Fallback copy to clipboard
function fallbackCopyToClipboard(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
        document.execCommand('copy');
        showNotification('Note copied to clipboard!', 'success');
    } catch (err) {
        showNotification('Failed to copy to clipboard', 'error');
    }
    
    document.body.removeChild(textArea);
}

// Toggle Fullscreen
function toggleFullscreen() {
    const editorContainer = document.querySelector('.editor-container');
    const fullscreenBtn = document.getElementById('fullscreenBtn');
    const icon = fullscreenBtn.querySelector('i');
    
    if (!document.fullscreenElement) {
        // Enter fullscreen
        if (editorContainer.requestFullscreen) {
            editorContainer.requestFullscreen();
        } else if (editorContainer.webkitRequestFullscreen) {
            editorContainer.webkitRequestFullscreen();
        } else if (editorContainer.msRequestFullscreen) {
            editorContainer.msRequestFullscreen();
        }
        
        icon.className = 'fas fa-compress';
        fullscreenBtn.title = 'Exit Full Screen';
    } else {
        // Exit fullscreen
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
        
        icon.className = 'fas fa-expand';
        fullscreenBtn.title = 'Full Screen';
    }
}

// Handle fullscreen change events
document.addEventListener('fullscreenchange', updateFullscreenIcon);
document.addEventListener('webkitfullscreenchange', updateFullscreenIcon);
document.addEventListener('msfullscreenchange', updateFullscreenIcon);

function updateFullscreenIcon() {
    const fullscreenBtn = document.getElementById('fullscreenBtn');
    const icon = fullscreenBtn.querySelector('i');
    
    if (document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement) {
        icon.className = 'fas fa-compress';
        fullscreenBtn.title = 'Exit Full Screen';
    } else {
        icon.className = 'fas fa-expand';
        fullscreenBtn.title = 'Full Screen';
    }
}

// Import Note
function importNote(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        const content = e.target.result;
        const fileName = file.name.replace(/\.[^/.]+$/, '');
        
        // Handle different file types
        if (file.name.endsWith('.txt')) {
            // Plain text file
            const lines = content.split('\n');
            const title = lines[0] || fileName;
            const textContent = lines.slice(1).join('\n') || lines[0] || '';
            
            document.getElementById('noteTitle').value = title.trim() || fileName;
            // Convert plain text to HTML with line breaks
            document.getElementById('noteEditor').innerHTML = textContent.split('\n').map(line => {
                if (line.trim() === '') return '<p><br></p>';
                return `<p>${escapeHtml(line)}</p>`;
            }).join('');
        } else if (file.name.endsWith('.html') || file.name.endsWith('.htm')) {
            // HTML file
            const parser = new DOMParser();
            const doc = parser.parseFromString(content, 'text/html');
            
            const title = doc.querySelector('h1')?.textContent || doc.querySelector('title')?.textContent || fileName;
            let bodyContent = doc.body.innerHTML;
            
            // Remove title if it's an h1 in the body
            bodyContent = bodyContent.replace(/<h1[^>]*>.*?<\/h1>/i, '');
            
            document.getElementById('noteTitle').value = title.trim() || fileName;
            document.getElementById('noteEditor').innerHTML = bodyContent || '<p><br></p>';
        } else {
            // Try to parse as HTML, fallback to plain text
            try {
                const parser = new DOMParser();
                const doc = parser.parseFromString(content, 'text/html');
                
                if (doc.querySelector('parseerror')) {
                    throw new Error('Not valid HTML');
                }
                
                const title = doc.querySelector('h1')?.textContent || doc.querySelector('title')?.textContent || fileName;
                let bodyContent = doc.body.innerHTML;
                bodyContent = bodyContent.replace(/<h1[^>]*>.*?<\/h1>/i, '');
                
                document.getElementById('noteTitle').value = title.trim() || fileName;
                document.getElementById('noteEditor').innerHTML = bodyContent || '<p><br></p>';
            } catch (err) {
                // Fallback to plain text
                document.getElementById('noteTitle').value = fileName;
                document.getElementById('noteEditor').innerHTML = content.split('\n').map(line => {
                    if (line.trim() === '') return '<p><br></p>';
                    return `<p>${escapeHtml(line)}</p>`;
                }).join('');
            }
        }
        
        updateWordCount();
        showNotification('Note imported successfully!', 'success');
        
        // Auto-save the imported note
        setTimeout(() => {
            saveNote();
        }, 500);
    };
    
    reader.onerror = () => {
        showNotification('Error reading file', 'error');
    };
    
    reader.readAsText(file);
    event.target.value = ''; // Reset input
}

// Auto Save
let lastSavedContent = '';
let lastSavedTitle = '';

function startAutoSave() {
    // Clear any existing interval
    if (autoSaveInterval) {
        clearInterval(autoSaveInterval);
    }
    
    autoSaveInterval = setInterval(() => {
        const editor = document.getElementById('noteEditor');
        const titleInput = document.getElementById('noteTitle');
        
        if (!editor || !titleInput) {
            return;
        }
        
        const currentContent = editor.innerHTML;
        const currentTitle = titleInput.value.trim();
        const textContent = editor.innerText || editor.textContent;
        
        // Check if there are actual changes
        const hasChanges = (currentContent !== lastSavedContent) || 
                          (currentTitle !== lastSavedTitle) ||
                          (currentNoteId && (textContent.trim() || currentTitle));
        
        // Save if:
        // 1. There's a current note ID (editing existing note), OR
        // 2. There's content in the editor, OR
        // 3. Title has been changed from default
        if (hasChanges && (currentNoteId || textContent.trim() || (currentTitle && currentTitle !== 'Untitled Document'))) {
            saveNote().then((saved) => {
                // Update last saved content after successful save
                if (saved) {
                    lastSavedContent = currentContent;
                    lastSavedTitle = currentTitle;
                    // Show auto-save notification (shorter duration - 2 seconds)
                    showNotification('Auto-saved', 'success', 2000);
                } else {
                    // Still show notification even if save returned false (might be empty note)
                    console.log('Auto-save: Note not saved (might be empty)');
                }
            }).catch(err => {
                console.error('Auto-save error:', err);
                // Don't show error notification for auto-save to avoid interrupting user
            });
        }
    }, 30000); // Auto-save every 30 seconds
}

// Open Notes Modal
function openNotesModal() {
    const notesModal = document.getElementById('notesModal');
    if (notesModal) {
        notesModal.classList.add('active');
        loadNotes();
    }
}

// Close Notes Modal
function closeNotesModal() {
    document.getElementById('notesModal').classList.remove('active');
}

// Update Last Saved
function updateLastSaved(message) {
    // This function is kept for compatibility but may not be used in new design
    const lastSavedEl = document.getElementById('lastSaved');
    if (lastSavedEl) {
        lastSavedEl.innerHTML = `<i class="fas fa-save"></i> ${message}`;
        lastSavedEl.style.animation = 'pulse 0.5s ease';
        setTimeout(() => {
            lastSavedEl.style.animation = '';
        }, 500);
    }
}

// Format Date
function formatDate(dateString) {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} minutes ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} hours ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)} days ago`;
    
    return date.toLocaleDateString();
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Debounce
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Show Notification
function showNotification(message, type = 'info', duration = 3500) {
    // Remove existing notifications
    const existing = document.querySelectorAll('.notification');
    existing.forEach(n => n.remove());
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        info: 'fa-info-circle'
    };
    
    const bgColors = {
        success: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
        error: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
        info: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)'
    };
    
    notification.innerHTML = `
        <i class="fas ${icons[type] || icons.info}"></i>
        <span>${message}</span>
    `;
    
    notification.style.cssText = `
        position: fixed;
        top: 24px;
        right: 24px;
        background: ${bgColors[type] || bgColors.info};
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 12px;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.2), 0 0 20px rgba(99, 102, 241, 0.3);
        z-index: 10000;
        animation: slideInRight 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        display: flex;
        align-items: center;
        gap: 0.75rem;
        font-weight: 500;
        min-width: 250px;
        backdrop-filter: blur(10px);
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, duration);
}

// Color conversion utilities
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

function rgbToHex(r, g, b) {
    return "#" + [r, g, b].map(x => {
        const hex = x.toString(16);
        return hex.length === 1 ? "0" + hex : hex;
    }).join("");
}

function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0;
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
            case g: h = ((b - r) / d + 2) / 6; break;
            case b: h = ((r - g) / d + 4) / 6; break;
        }
    }
    return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToRgb(h, s, l) {
    h /= 360;
    s /= 100;
    l /= 100;
    let r, g, b;
    if (s === 0) {
        r = g = b = l;
    } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }
    return {
        r: Math.round(r * 255),
        g: Math.round(g * 255),
        b: Math.round(b * 255)
    };
}

// Show Color Picker
function showColorPicker(type) {
    // Remove existing color picker if any
    const existing = document.getElementById('colorPickerContainer');
    if (existing) existing.remove();
    
    const btn = type === 'text' ? document.getElementById('textColorBtn') : document.getElementById('highlightColorBtn');
    const colorIndicator = btn.querySelector('.color-indicator');
    
    // Get current color if available
    let currentColor = '#ff3e3e';
    if (colorIndicator) {
        const bgColor = window.getComputedStyle(colorIndicator).backgroundColor;
        if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)') {
            // Convert rgb to hex if needed
            const rgbToHex = (rgb) => {
                const match = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
                if (match) {
                    const r = parseInt(match[1]).toString(16).padStart(2, '0');
                    const g = parseInt(match[2]).toString(16).padStart(2, '0');
                    const b = parseInt(match[3]).toString(16).padStart(2, '0');
                    return `#${r}${g}${b}`;
                }
                return '#ff3e3e';
            };
            currentColor = bgColor.startsWith('#') ? bgColor : rgbToHex(bgColor);
        }
    }
    
    // Initialize color state
    const rgb = hexToRgb(currentColor) || { r: 255, g: 62, b: 62 };
    let hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    
    // Create color picker container
    const pickerContainer = document.createElement('div');
    pickerContainer.id = 'colorPickerContainer';
    const pickerWidth = 220;
    pickerContainer.style.cssText = `
        position: fixed;
        background: #ffffff;
        border: 1px solid #e0e0e0;
        border-radius: 10px;
        padding: 12px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        z-index: 10000;
        width: ${pickerWidth}px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    
    // Hex input
    const hexLabel = document.createElement('div');
    hexLabel.textContent = 'Hex';
    hexLabel.style.cssText = 'font-size: 11px; color: #666; margin-bottom: 3px; font-weight: 500;';
    
    const hexInput = document.createElement('input');
    hexInput.type = 'text';
    hexInput.value = currentColor.toUpperCase();
    hexInput.style.cssText = `
        width: 100%;
        padding: 6px;
        border: 1px solid #e0e0e0;
        border-radius: 5px;
        font-size: 12px;
        margin-bottom: 10px;
        font-family: monospace;
    `;
    
    // Draw functions
    function drawHueSlider() {
        const ctx = hueCanvas.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, hueCanvas.width, 0);
        // Create smooth hue gradient
        for (let i = 0; i <= 360; i += 30) {
            const rgb = hslToRgb(i, 100, 50);
            gradient.addColorStop(i / 360, rgbToHex(rgb.r, rgb.g, rgb.b));
        }
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, hueCanvas.width, hueCanvas.height);
    }
    
    function drawSLSquare() {
        const ctx = slCanvas.getContext('2d');
        const hue = hsl.h;
        const rgb = hslToRgb(hue, 100, 50);
        const baseColor = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
        
        // Horizontal gradient (saturation)
        const satGradient = ctx.createLinearGradient(0, 0, slCanvas.width, 0);
        satGradient.addColorStop(0, '#ffffff');
        satGradient.addColorStop(1, baseColor);
        ctx.fillStyle = satGradient;
        ctx.fillRect(0, 0, slCanvas.width, slCanvas.height);
        
        // Vertical gradient (lightness)
        const lightGradient = ctx.createLinearGradient(0, 0, 0, slCanvas.height);
        lightGradient.addColorStop(0, 'rgba(0,0,0,0)');
        lightGradient.addColorStop(1, 'rgba(0,0,0,1)');
        ctx.fillStyle = lightGradient;
        ctx.fillRect(0, 0, slCanvas.width, slCanvas.height);
    }
    
    function updateColor(hex) {
        const rgb = hexToRgb(hex);
        if (rgb) {
            hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
            updateUI();
            hexInput.value = hex.toUpperCase();
        }
    }
    
    function updateUI() {
        const rgb = hslToRgb(hsl.h, hsl.s, hsl.l);
        const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
        
        // Update hex input
        hexInput.value = hex.toUpperCase();
        
        // Update preview
        previewBar.style.background = hex;
        
        // Update indicators
        const sPercent = hsl.s / 100;
        const lPercent = hsl.l / 100;
        slIndicator.style.left = (sPercent * 100) + '%';
        slIndicator.style.top = (100 - lPercent * 100) + '%';
        
        const huePercent = hsl.h / 360;
        hueIndicator.style.left = (huePercent * 100) + '%';
        
        // Redraw SL square
        drawSLSquare();
    }
    
    // Color swatches
    const swatches = [
        '#ff0000', '#ff6600', '#ffcc00', '#996633',
        '#66cc00', '#006600', '#6600ff', '#0066ff',
        '#00cccc', '#33cc66', '#000000', '#666666',
        '#ffffff', '#cccccc'
    ];
    
    const swatchesContainer = document.createElement('div');
    swatchesContainer.style.cssText = 'display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; margin-bottom: 10px;';
    
    swatches.forEach(swatch => {
        const swatchBtn = document.createElement('button');
        swatchBtn.style.cssText = `
            width: 22px;
            height: 22px;
            border: ${swatch === '#ffffff' ? '1px solid #e0e0e0' : 'none'};
            border-radius: 5px;
            background: ${swatch};
            cursor: pointer;
            padding: 0;
        `;
        swatchBtn.addEventListener('click', () => {
            updateColor(swatch);
        });
        swatchesContainer.appendChild(swatchBtn);
    });
    
    // Saturation/Lightness square
    const slContainer = document.createElement('div');
    slContainer.style.cssText = `
        position: relative;
        width: 100%;
        height: 150px;
        border-radius: 6px;
        margin-bottom: 10px;
        cursor: crosshair;
        overflow: hidden;
    `;
    
    const slCanvas = document.createElement('canvas');
    slCanvas.width = pickerWidth - 24;
    slCanvas.height = 150;
    slCanvas.style.cssText = 'width: 100%; height: 100%; display: block;';
    
    const slIndicator = document.createElement('div');
    slIndicator.style.cssText = `
        position: absolute;
        width: 14px;
        height: 14px;
        border: 2px solid white;
        border-radius: 50%;
        pointer-events: none;
        box-shadow: 0 0 0 1px rgba(0,0,0,0.2);
        transform: translate(-50%, -50%);
    `;
    
    slContainer.appendChild(slCanvas);
    slContainer.appendChild(slIndicator);
    
    // Hue slider
    const hueContainer = document.createElement('div');
    hueContainer.style.cssText = `
        position: relative;
        width: 100%;
        height: 16px;
        border-radius: 8px;
        margin-bottom: 10px;
        cursor: pointer;
        overflow: hidden;
    `;
    
    const hueCanvas = document.createElement('canvas');
    hueCanvas.width = pickerWidth - 24;
    hueCanvas.height = 16;
    hueCanvas.style.cssText = 'width: 100%; height: 100%; display: block;';
    
    const hueIndicator = document.createElement('div');
    hueIndicator.style.cssText = `
        position: absolute;
        width: 16px;
        height: 16px;
        border: 2px solid white;
        border-radius: 50%;
        pointer-events: none;
        box-shadow: 0 0 0 1px rgba(0,0,0,0.2);
        transform: translate(-50%, 0);
    `;
    
    hueContainer.appendChild(hueCanvas);
    hueContainer.appendChild(hueIndicator);
    
    // Color preview bar
    const previewBar = document.createElement('div');
    previewBar.style.cssText = `
        width: 100%;
        height: 30px;
        border-radius: 6px;
        background: ${currentColor};
    `;
    
    // Event handlers
    let isDraggingSL = false;
    let isDraggingHue = false;
    
    function handleSLMove(e) {
        const rect = slContainer.getBoundingClientRect();
        const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
        const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
        
        hsl.s = (x / rect.width) * 100;
        hsl.l = 100 - (y / rect.height) * 100;
        
        updateUI();
    }
    
    function handleHueMove(e) {
        const rect = hueContainer.getBoundingClientRect();
        const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
        hsl.h = (x / rect.width) * 360;
        updateUI();
    }
    
    function handleMouseMove(e) {
        if (isDraggingSL) handleSLMove(e);
        if (isDraggingHue) handleHueMove(e);
    }
    
    function handleMouseUp() {
        isDraggingSL = false;
        isDraggingHue = false;
    }
    
    slContainer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        isDraggingSL = true;
        handleSLMove(e);
    });
    
    hueContainer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        isDraggingHue = true;
        handleHueMove(e);
    });
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    hexInput.addEventListener('input', (e) => {
        let hex = e.target.value.trim();
        if (!hex.startsWith('#')) {
            hex = '#' + hex;
        }
        if (/^#[0-9A-Fa-f]{0,6}$/i.test(hex) && hex.length === 7) {
            updateColor(hex);
        }
    });
    
    hexInput.addEventListener('blur', (e) => {
        let hex = e.target.value.trim();
        if (!hex.startsWith('#')) {
            hex = '#' + hex;
        }
        if (/^#[0-9A-Fa-f]{6}$/i.test(hex)) {
            updateColor(hex);
        } else {
            // Reset to current color if invalid
            const rgb = hslToRgb(hsl.h, hsl.s, hsl.l);
            hexInput.value = rgbToHex(rgb.r, rgb.g, rgb.b).toUpperCase();
        }
    });
    
    // Cleanup function
    function cleanup() {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        isDraggingSL = false;
        isDraggingHue = false;
    }
    
    // Assemble picker
    pickerContainer.appendChild(hexLabel);
    pickerContainer.appendChild(hexInput);
    pickerContainer.appendChild(swatchesContainer);
    pickerContainer.appendChild(slContainer);
    pickerContainer.appendChild(hueContainer);
    pickerContainer.appendChild(previewBar);
    
    // Apply button
    const applyBtn = document.createElement('button');
    applyBtn.textContent = 'Apply';
    applyBtn.style.cssText = `
        width: 100%;
        padding: 8px;
        margin-top: 10px;
        background: #007bff;
        color: white;
        border: none;
        border-radius: 5px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
    `;
    applyBtn.addEventListener('click', () => {
        const rgb = hslToRgb(hsl.h, hsl.s, hsl.l);
        const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
        
        if (type === 'text') {
            document.execCommand('foreColor', false, hex);
            if (colorIndicator) {
                colorIndicator.style.background = hex;
            }
        } else {
            document.execCommand('backColor', false, hex);
        }
        
        updateToolbarState();
        cleanup();
        pickerContainer.remove();
    });
    
    pickerContainer.appendChild(applyBtn);
    
    // Position the picker
    const rect = btn.getBoundingClientRect();
    let left = rect.right + 10;
    let top = rect.top;
    
    if (left + pickerWidth > window.innerWidth) {
        left = rect.left - pickerWidth - 10;
    }
    
    if (top + 320 > window.innerHeight) {
        top = window.innerHeight - 320 - 10;
    }
    
    pickerContainer.style.left = left + 'px';
    pickerContainer.style.top = top + 'px';
    
    document.body.appendChild(pickerContainer);
    
    // Initial draw after DOM insertion
    setTimeout(() => {
        drawHueSlider();
        updateUI();
    }, 0);
    
    // Close on outside click
    setTimeout(() => {
        const closePicker = (e) => {
            if (!pickerContainer.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
                cleanup();
                pickerContainer.remove();
                document.removeEventListener('click', closePicker);
            }
        };
        document.addEventListener('click', closePicker);
    }, 0);
    
    // Cleanup on escape key
    const escapeHandler = (e) => {
        if (e.key === 'Escape') {
            cleanup();
            pickerContainer.remove();
            document.removeEventListener('keydown', escapeHandler);
        }
    };
    document.addEventListener('keydown', escapeHandler);
}

// Show Paragraph Style Menu
function showParagraphStyleMenu(button) {
    const styles = [
        { name: 'Normal', icon: 'fa-paragraph', value: 'p' },
        { name: 'Heading 1', icon: 'fa-heading', value: 'h1' },
        { name: 'Heading 2', icon: 'fa-heading', value: 'h2' },
        { name: 'Heading 3', icon: 'fa-heading', value: 'h3' },
        { name: 'Number List', icon: 'fa-list-ol', value: 'ol' },
        { name: 'Bullet List', icon: 'fa-list-ul', value: 'ul' },
        { name: 'Check List', icon: 'fa-tasks', value: 'checklist' },
        { name: 'Quote', icon: 'fa-quote-right', value: 'blockquote' },
        { name: 'Code Block', icon: 'fa-code', value: 'pre' }
    ];
    
    const existing = document.getElementById('paragraphStyleMenu');
    if (existing) existing.remove();
    
    const menu = document.createElement('div');
    menu.id = 'paragraphStyleMenu';
    menu.style.cssText = `
        position: absolute;
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        box-shadow: var(--shadow-md);
        z-index: 10000;
        min-width: 200px;
        overflow: hidden;
    `;
    
    styles.forEach(style => {
        const item = document.createElement('button');
        item.innerHTML = `<i class="fas ${style.icon}"></i> ${style.name}`;
        item.style.cssText = `
            width: 100%;
            padding: 0.75rem 1rem;
            border: none;
            background: transparent;
            color: var(--text-primary);
            text-align: left;
            cursor: pointer;
            transition: background-color 0.2s;
            display: flex;
            align-items: center;
            gap: 0.75rem;
            font-size: 0.9375rem;
        `;
        item.addEventListener('mouseenter', () => {
            item.style.background = 'var(--hover-bg)';
        });
        item.addEventListener('mouseleave', () => {
            item.style.background = 'transparent';
        });
        item.addEventListener('click', () => {
            applyParagraphStyle(style.value, style.name, style.icon, button);
            menu.remove();
        });
        menu.appendChild(item);
    });
    
    const rect = button.getBoundingClientRect();
    menu.style.top = (rect.bottom + 5) + 'px';
    menu.style.left = rect.left + 'px';
    
    document.body.appendChild(menu);
    
    setTimeout(() => {
        document.addEventListener('click', function closeMenu(e) {
            if (!menu.contains(e.target) && e.target !== button) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        });
    }, 0);
}

// Apply Paragraph Style
function applyParagraphStyle(value, name, icon, button) {
    const editor = document.getElementById('noteEditor');
    const selection = window.getSelection();
    
    if (value === 'p') {
        document.execCommand('formatBlock', false, 'p');
    } else if (value === 'h1' || value === 'h2' || value === 'h3') {
        document.execCommand('formatBlock', false, value);
    } else if (value === 'ol') {
        // Number List (Ordered List)
        document.execCommand('insertOrderedList', false, null);
    } else if (value === 'ul') {
        // Bullet List (Unordered List)
        document.execCommand('insertUnorderedList', false, null);
    } else if (value === 'checklist') {
        // Check List
        insertCheckList();
    } else if (value === 'blockquote') {
        // Quote (Blockquote)
        document.execCommand('formatBlock', false, 'blockquote');
    } else if (value === 'pre') {
        // Code Block
        insertCodeBlock();
    }
    
    // Update button text and icon
    const iconEl = button.querySelector('i.fa-paragraph, i.fa-heading, i.fa-list-ol, i.fa-list-ul, i.fa-tasks, i.fa-quote-right, i.fa-code');
    if (iconEl) iconEl.className = `fas ${icon}`;
    const span = button.querySelector('span');
    if (span) span.textContent = name;
    
    updateToolbarState();
}

// Show Case Menu
function showCaseMenu(button) {
    const cases = [
        { name: 'Lowercase', action: 'lower', icon: 'fa-text-height' },
        { name: 'Upper Case', action: 'upper', icon: 'fa-text-height' },
        { name: 'Capitalize', action: 'title', icon: 'fa-font' },
        { name: 'Sentence case', action: 'sentence', icon: 'fa-align-left' },
        { name: 'Strikethrough', action: 'strikethrough', icon: 'fa-strikethrough' },
        { name: 'Superscript', action: 'superscript', icon: 'fa-superscript' },
        { name: 'Highlight', action: 'highlight', icon: 'fa-highlighter' },
        { name: 'Clear Formatting', action: 'clearFormatting', icon: 'fa-eraser' }
    ];
    
    const existing = document.getElementById('caseMenu');
    if (existing) existing.remove();
    
    const menu = document.createElement('div');
    menu.id = 'caseMenu';
    menu.style.cssText = `
        position: absolute;
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        box-shadow: var(--shadow-md);
        z-index: 10000;
        min-width: 180px;
        overflow: hidden;
    `;
    
    cases.forEach(caseOption => {
        const item = document.createElement('button');
        item.innerHTML = `<i class="fas ${caseOption.icon}"></i> ${caseOption.name}`;
        item.style.cssText = `
            width: 100%;
            padding: 0.75rem 1rem;
            border: none;
            background: transparent;
            color: var(--text-primary);
            text-align: left;
            cursor: pointer;
            transition: background-color 0.2s;
            display: flex;
            align-items: center;
            gap: 0.75rem;
            font-size: 0.9375rem;
        `;
        item.addEventListener('mouseenter', () => {
            item.style.background = 'var(--hover-bg)';
        });
        item.addEventListener('mouseleave', () => {
            item.style.background = 'transparent';
        });
        item.addEventListener('click', () => {
            changeTextCase(caseOption.action);
            menu.remove();
        });
        menu.appendChild(item);
    });
    
    const rect = button.getBoundingClientRect();
    menu.style.top = (rect.bottom + 5) + 'px';
    menu.style.left = rect.left + 'px';
    
    document.body.appendChild(menu);
    
    setTimeout(() => {
        document.addEventListener('click', function closeMenu(e) {
            if (!menu.contains(e.target) && e.target !== button) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        });
    }, 0);
}

// Apply text align using CSS (for start/end alignment)
function applyTextAlign(align) {
    const selection = window.getSelection();
    if (selection.rangeCount === 0) return;
    
    const range = selection.getRangeAt(0);
    let element = range.commonAncestorContainer;
    
    // If it's a text node, get the parent element
    if (element.nodeType === Node.TEXT_NODE) {
        element = element.parentElement;
    }
    
    // Find the block-level element
    while (element && !['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'LI'].includes(element.tagName)) {
        element = element.parentElement;
    }
    
    if (element) {
        element.style.textAlign = align;
        updateToolbarState();
    }
}

// Change Text Case and Formatting
function changeTextCase(type) {
    const selection = window.getSelection();
    
    switch(type) {
        case 'upper':
            if (selection.rangeCount === 0 || selection.isCollapsed) return;
            const rangeUpper = selection.getRangeAt(0);
            const textUpper = selection.toString();
            const newTextUpper = textUpper.toUpperCase();
            document.execCommand('insertText', false, newTextUpper);
            break;
            
        case 'lower':
            if (selection.rangeCount === 0 || selection.isCollapsed) return;
            const rangeLower = selection.getRangeAt(0);
            const textLower = selection.toString();
            const newTextLower = textLower.toLowerCase();
            document.execCommand('insertText', false, newTextLower);
            break;
            
        case 'title':
            if (selection.rangeCount === 0 || selection.isCollapsed) return;
            const rangeTitle = selection.getRangeAt(0);
            const textTitle = selection.toString();
            const newTextTitle = textTitle.replace(/\w\S*/g, (txt) => 
                txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
            );
            document.execCommand('insertText', false, newTextTitle);
            break;
            
        case 'sentence':
            if (selection.rangeCount === 0 || selection.isCollapsed) return;
            const rangeSentence = selection.getRangeAt(0);
            const textSentence = selection.toString();
            const newTextSentence = textSentence.charAt(0).toUpperCase() + textSentence.slice(1).toLowerCase();
            document.execCommand('insertText', false, newTextSentence);
            break;
            
        case 'strikethrough':
            document.execCommand('strikeThrough', false, null);
            break;
            
        case 'superscript':
            document.execCommand('superscript', false, null);
            break;
            
        case 'highlight':
            // Apply yellow highlight
            document.execCommand('backColor', false, '#ffeb3b');
            break;
            
        case 'clearFormatting':
            // Clear all formatting from selection
            if (selection.rangeCount > 0 && !selection.isCollapsed) {
                const range = selection.getRangeAt(0);
                const text = selection.toString();
                // Remove formatting by inserting plain text
                document.execCommand('removeFormat', false, null);
                document.execCommand('unlink', false, null);
                // Also remove inline styles
                try {
                    const container = range.commonAncestorContainer;
                    const parent = container.nodeType === 3 ? container.parentElement : container;
                    if (parent) {
                        const styledElements = parent.querySelectorAll('[style]');
                        styledElements.forEach(el => {
                            if (range.intersectsNode(el)) {
                                el.removeAttribute('style');
                            }
                        });
                    }
                } catch (e) {
                    // Fallback: just remove format
                    document.execCommand('removeFormat', false, null);
                }
            } else {
                // Clear formatting from entire editor if no selection
                const editor = document.getElementById('noteEditor');
                const allStyled = editor.querySelectorAll('[style]');
                allStyled.forEach(el => {
                    if (el.style.length === 0 || el === editor) return;
                    el.removeAttribute('style');
                });
                showNotification('Formatting cleared from editor', 'success');
            }
            break;
    }
    
    updateToolbarState();
}

// Show Insert Menu
function showInsertMenu(button) {
    const items = [
        { name: 'Image', icon: 'fa-image', action: () => insertImage() },
        { name: 'Horizontal Line', icon: 'fa-minus', action: () => insertHorizontalLine() },
        { name: 'Table', icon: 'fa-table', action: () => insertTable() },
        { name: 'Page Break', icon: 'fa-file-alt', action: () => insertPageBreak() },
        { name: 'Draw', icon: 'fa-pencil-alt', action: () => insertDrawCanvas() },
        { name: 'Add Columns', icon: 'fa-columns', action: () => insertColumns() },
        { name: 'Equation', icon: 'fa-square-root-alt', action: () => insertEquation() },
        { name: 'Sticky Note', icon: 'fa-sticky-note', action: () => insertStickyNote() },
        { name: 'Collaps Container', icon: 'fa-chevron-down', action: () => insertCollapsContainer() },
        { name: 'Container', icon: 'fa-box', action: () => insertContainer() },
        { name: 'Date', icon: 'fa-calendar', action: () => insertDate() }
    ];
    
    const existing = document.getElementById('insertMenu');
    if (existing) existing.remove();
    
    const menu = document.createElement('div');
    menu.id = 'insertMenu';
    menu.style.cssText = `
        position: absolute;
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        box-shadow: var(--shadow-md);
        z-index: 10000;
        min-width: 180px;
        overflow: hidden;
    `;
    
    items.forEach(item => {
        const menuItem = document.createElement('button');
        menuItem.innerHTML = `<i class="fas ${item.icon}"></i> ${item.name}`;
        menuItem.style.cssText = `
            width: 100%;
            padding: 0.75rem 1rem;
            border: none;
            background: transparent;
            color: var(--text-primary);
            text-align: left;
            cursor: pointer;
            transition: background-color 0.2s;
            display: flex;
            align-items: center;
            gap: 0.75rem;
        `;
        menuItem.addEventListener('mouseenter', () => {
            menuItem.style.background = 'var(--hover-bg)';
        });
        menuItem.addEventListener('mouseleave', () => {
            menuItem.style.background = 'transparent';
        });
        menuItem.addEventListener('click', () => {
            item.action();
            menu.remove();
        });
        menu.appendChild(menuItem);
    });
    
    const rect = button.getBoundingClientRect();
    menu.style.top = (rect.bottom + 5) + 'px';
    menu.style.left = rect.left + 'px';
    
    document.body.appendChild(menu);
    
    setTimeout(() => {
        document.addEventListener('click', function closeMenu(e) {
            if (!menu.contains(e.target) && e.target !== button) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        });
    }, 0);
}

// Insert Horizontal Line
function insertHorizontalLine() {
    document.execCommand('insertHorizontalRule', false, null);
    updateToolbarState();
}

// Insert Table
function insertTable() {
    const rows = prompt('Number of rows:', '3');
    const cols = prompt('Number of columns:', '3');
    
    if (rows && cols && !isNaN(rows) && !isNaN(cols)) {
        const rowCount = parseInt(rows);
        const colCount = parseInt(cols);
        
        if (rowCount > 0 && rowCount <= 20 && colCount > 0 && colCount <= 10) {
            let tableHTML = '<table><tbody>';
            for (let i = 0; i < rowCount; i++) {
                tableHTML += '<tr>';
                for (let j = 0; j < colCount; j++) {
                    tableHTML += '<td>&nbsp;</td>';
                }
                tableHTML += '</tr>';
            }
            tableHTML += '</tbody></table>';
            
            document.execCommand('insertHTML', false, tableHTML);
            updateToolbarState();
            showNotification('Table inserted successfully!', 'success');
        } else {
            showNotification('Please enter valid numbers (1-20 rows, 1-10 columns)', 'error');
        }
    }
}

// Insert Page Break
function insertPageBreak() {
    const pageBreak = '<div style="page-break-after: always; break-after: page; margin: 2rem 0; border-top: 2px dashed var(--border-color);"></div>';
    document.execCommand('insertHTML', false, pageBreak);
    updateToolbarState();
    showNotification('Page break inserted!', 'success');
}

// Insert Draw Canvas
function insertDrawCanvas() {
    const canvasId = 'draw-canvas-' + Date.now();
    const drawHTML = `
        <div class="draw-container" style="margin: 1rem 0; border: 2px solid var(--border-color); border-radius: 8px; padding: 1rem; background: var(--bg-secondary);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                <strong>Drawing Canvas</strong>
                <button onclick="clearCanvas('${canvasId}')" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-primary); cursor: pointer;">Clear</button>
            </div>
            <canvas id="${canvasId}" width="600" height="300" style="border: 1px solid var(--border-color); border-radius: 4px; cursor: crosshair; background: white; max-width: 100%;"></canvas>
        </div>
    `;
    document.execCommand('insertHTML', false, drawHTML);
    
    // Initialize drawing on the canvas
    setTimeout(() => {
        initCanvasDrawing(canvasId);
    }, 100);
    
    updateToolbarState();
    showNotification('Drawing canvas inserted!', 'success');
}

// Initialize Canvas Drawing
function initCanvasDrawing(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    let isDrawing = false;
    let lastX = 0;
    let lastY = 0;
    
    // Set default stroke style
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    
    canvas.addEventListener('mousedown', (e) => {
        isDrawing = true;
        const rect = canvas.getBoundingClientRect();
        lastX = e.clientX - rect.left;
        lastY = e.clientY - rect.top;
    });
    
    canvas.addEventListener('mousemove', (e) => {
        if (!isDrawing) return;
        const rect = canvas.getBoundingClientRect();
        const currentX = e.clientX - rect.left;
        const currentY = e.clientY - rect.top;
        
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(currentX, currentY);
        ctx.stroke();
        
        lastX = currentX;
        lastY = currentY;
    });
    
    canvas.addEventListener('mouseup', () => {
        isDrawing = false;
    });
    
    canvas.addEventListener('mouseout', () => {
        isDrawing = false;
    });
}

// Clear Canvas (global function for onclick)
window.clearCanvas = function(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
};

// Insert Columns
function insertColumns() {
    const cols = prompt('Number of columns (2-4):', '2');
    if (cols && !isNaN(cols) && parseInt(cols) >= 2 && parseInt(cols) <= 4) {
        const colCount = parseInt(cols);
        let columnsHTML = '<div class="columns-container" style="display: grid; grid-template-columns: repeat(' + colCount + ', 1fr); gap: 1rem; margin: 1rem 0;">';
        for (let i = 0; i < colCount; i++) {
            columnsHTML += '<div class="column" style="padding: 1rem; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-secondary); min-height: 100px;"><p>&nbsp;</p></div>';
        }
        columnsHTML += '</div>';
        
        document.execCommand('insertHTML', false, columnsHTML);
        updateToolbarState();
        showNotification(`${colCount} columns inserted!`, 'success');
    } else {
        showNotification('Please enter a number between 2 and 4', 'error');
    }
}

// Insert Equation
function insertEquation() {
    const equation = prompt('Enter equation (e.g., E = mc², x² + y² = z²):', 'E = mc²');
    if (equation && equation.trim()) {
        const equationHTML = `<span class="equation" style="display: inline-block; padding: 0.25rem 0.5rem; margin: 0 0.25rem; background: var(--bg-tertiary); border-radius: 4px; font-family: 'Courier New', monospace; font-size: 1.1em;">${escapeHtml(equation)}</span>`;
        document.execCommand('insertHTML', false, equationHTML);
        updateToolbarState();
        showNotification('Equation inserted!', 'success');
    }
}

// Insert Sticky Note
function insertStickyNote() {
    const noteText = prompt('Enter sticky note text:', '');
    const colors = ['#ffeb3b', '#ff9800', '#4caf50', '#2196f3', '#9c27b0'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    
    const stickyHTML = `
        <div class="sticky-note" style="display: inline-block; margin: 0.5rem; padding: 1rem; min-width: 200px; max-width: 300px; background: ${randomColor}; box-shadow: 2px 2px 8px rgba(0,0,0,0.2); transform: rotate(${Math.random() * 6 - 3}deg); border-radius: 4px;">
            <p style="margin: 0; font-weight: 500; color: #333;">${escapeHtml(noteText || 'Sticky Note')}</p>
        </div>
    `;
    document.execCommand('insertHTML', false, stickyHTML);
    updateToolbarState();
    showNotification('Sticky note inserted!', 'success');
}

// Insert Collaps Container
function insertCollapsContainer() {
    const title = prompt('Enter collapsible container title:', 'Click to expand');
    const collapsibleId = 'collapsible-' + Date.now();
    
    const collapsibleHTML = `
        <div class="collapsible-container" style="margin: 1rem 0; border: 2px solid var(--border-color); border-radius: 8px; overflow: hidden; background: var(--bg-secondary); box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <button onclick="toggleCollapsible('${collapsibleId}')" style="width: 100%; padding: 0.75rem 1rem; text-align: left; background: var(--bg-secondary); border: none; cursor: pointer; font-weight: 500; display: flex; justify-content: space-between; align-items: center;">
                <span>${escapeHtml(title)}</span>
                <i class="fas fa-chevron-down" id="${collapsibleId}-icon"></i>
            </button>
            <div id="${collapsibleId}" style="display: none; padding: 1.5rem; background: var(--bg-primary); border-top: 1px solid var(--border-color);">
                <div contenteditable="true" style="min-height: 100px; outline: none;">
                    <p style="margin: 0;">Container content goes here...</p>
                </div>
            </div>
        </div>
    `;
    document.execCommand('insertHTML', false, collapsibleHTML);
    updateToolbarState();
    showNotification('Collapsible container inserted!', 'success');
}

// Toggle Collapsible (global function for onclick)
window.toggleCollapsible = function(id) {
    const content = document.getElementById(id);
    const icon = document.getElementById(id + '-icon');
    if (content && icon) {
        if (content.style.display === 'none') {
            content.style.display = 'block';
            icon.className = 'fas fa-chevron-up';
        } else {
            content.style.display = 'none';
            icon.className = 'fas fa-chevron-down';
        }
    }
};

// Insert Container
function insertContainer() {
    const containerHTML = `
        <div class="content-container" style="margin: 1rem 0; padding: 1.5rem; border: 2px solid var(--border-color); border-radius: 8px; background: var(--bg-secondary); box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <p style="margin: 0;">Container content goes here...</p>
        </div>
    `;
    document.execCommand('insertHTML', false, containerHTML);
    updateToolbarState();
    showNotification('Container inserted!', 'success');
}

// Insert Date
function insertDate() {
    const now = new Date();
    const options = { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    };
    const dateString = now.toLocaleDateString('en-US', options);
    
    const dateHTML = `<span class="date-insert" style="display: inline-block; padding: 0.25rem 0.75rem; margin: 0 0.25rem; background: var(--bg-tertiary); border-radius: 4px; font-weight: 500; color: var(--primary-color);">${dateString}</span>`;
    document.execCommand('insertHTML', false, dateHTML);
    updateToolbarState();
    showNotification('Date inserted!', 'success');
}

// Insert Check List
function insertCheckList() {
    const checklistHTML = `
        <ul class="checklist" style="list-style: none; padding-left: 0; margin: 1rem 0;">
            <li style="display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0;">
                <input type="checkbox" style="cursor: pointer;">
                <span contenteditable="true" style="flex: 1; outline: none;">Checklist item</span>
            </li>
            <li style="display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0;">
                <input type="checkbox" style="cursor: pointer;">
                <span contenteditable="true" style="flex: 1; outline: none;">Checklist item</span>
            </li>
        </ul>
    `;
    document.execCommand('insertHTML', false, checklistHTML);
    updateToolbarState();
    showNotification('Checklist inserted!', 'success');
}

// Insert Code Block
function insertCodeBlock() {
    const codeBlockHTML = `
        <pre style="background: var(--bg-tertiary); padding: 1rem; border-radius: 6px; overflow-x: auto; margin: 1rem 0; border: 1px solid var(--border-color);"><code contenteditable="true" style="font-family: 'Courier New', monospace; font-size: 0.9em; outline: none; display: block; white-space: pre-wrap;">// Code goes here</code></pre>
    `;
    document.execCommand('insertHTML', false, codeBlockHTML);
    updateToolbarState();
    showNotification('Code block inserted!', 'success');
}

// Show Align Menu
function showAlignMenu(button) {
    const aligns = [
        { name: 'Left Align', icon: 'fa-align-left', value: 'left', type: 'align' },
        { name: 'Center Align', icon: 'fa-align-center', value: 'center', type: 'align' },
        { name: 'Justify Align', icon: 'fa-align-justify', value: 'justify', type: 'align' },
        { name: 'Start Align', icon: 'fa-align-left', value: 'start', type: 'align' },
        { name: 'End Align', icon: 'fa-align-right', value: 'end', type: 'align' },
        { name: 'Outdent', icon: 'fa-outdent', value: 'outdent', type: 'indent' },
        { name: 'Indent', icon: 'fa-indent', value: 'indent', type: 'indent' }
    ];
    
    const existing = document.getElementById('alignMenu');
    if (existing) existing.remove();
    
    const menu = document.createElement('div');
    menu.id = 'alignMenu';
    menu.style.cssText = `
        position: absolute;
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        box-shadow: var(--shadow-md);
        z-index: 10000;
        min-width: 180px;
        overflow: hidden;
    `;
    
    aligns.forEach(align => {
        const item = document.createElement('button');
        item.innerHTML = `<i class="fas ${align.icon}"></i> ${align.name}`;
        item.style.cssText = `
            width: 100%;
            padding: 0.75rem 1rem;
            border: none;
            background: transparent;
            color: var(--text-primary);
            text-align: left;
            cursor: pointer;
            transition: background-color 0.2s;
            display: flex;
            align-items: center;
            gap: 0.75rem;
        `;
        item.addEventListener('mouseenter', () => {
            item.style.background = 'var(--hover-bg)';
        });
        item.addEventListener('mouseleave', () => {
            item.style.background = 'transparent';
        });
        item.addEventListener('click', () => {
            if (align.type === 'align') {
                // Apply text alignment
                if (align.value === 'left') {
                    document.execCommand('justifyLeft', false, null);
                } else if (align.value === 'center') {
                    document.execCommand('justifyCenter', false, null);
                } else if (align.value === 'right') {
                    document.execCommand('justifyRight', false, null);
                } else if (align.value === 'justify') {
                    document.execCommand('justifyFull', false, null);
                } else if (align.value === 'start') {
                    // Start align (left for LTR, right for RTL)
                    applyTextAlign('start');
                } else if (align.value === 'end') {
                    // End align (right for LTR, left for RTL)
                    applyTextAlign('end');
                }
            } else if (align.type === 'indent') {
                // Apply indent/outdent
                if (align.value === 'indent') {
                    document.execCommand('indent', false, null);
                } else if (align.value === 'outdent') {
                    document.execCommand('outdent', false, null);
                }
            }
            
            // Update button text and icon
            const icon = button.querySelector('i.fa-align-left, i.fa-align-center, i.fa-align-right, i.fa-align-justify, i.fa-outdent, i.fa-indent');
            if (icon) icon.className = `fas ${align.icon}`;
            const span = button.querySelector('span');
            if (span) span.textContent = align.name;
            
            menu.remove();
            updateToolbarState();
        });
        menu.appendChild(item);
    });
    
    const rect = button.getBoundingClientRect();
    menu.style.top = (rect.bottom + 5) + 'px';
    menu.style.left = rect.left + 'px';
    
    document.body.appendChild(menu);
    
    setTimeout(() => {
        document.addEventListener('click', function closeMenu(e) {
            if (!menu.contains(e.target) && e.target !== button) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        });
    }, 0);
}

// Setup Keyboard Shortcuts
function setupKeyboardShortcuts() {
    const editor = document.getElementById('noteEditor');
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    
    document.addEventListener('keydown', (e) => {
        const ctrlKey = isMac ? e.metaKey : e.ctrlKey;
        const shiftKey = e.shiftKey;
        
        // Don't trigger shortcuts when typing in input fields
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            // Allow some shortcuts in editor
            if (e.target.id !== 'noteEditor' && e.target.id !== 'searchInput') {
                return;
            }
        }
        
        // Ctrl/Cmd + ? - Show shortcuts
        if (ctrlKey && e.key === '?') {
            e.preventDefault();
            showShortcutsModal();
            return;
        }
        
        // Only process shortcuts when editor is focused or no input is focused
        if (e.target.id !== 'noteEditor' && e.target.id !== 'searchInput' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
            // Ctrl/Cmd + N - New Note
            if (ctrlKey && e.key === 'n') {
                e.preventDefault();
                createNewNote();
                return;
            }
            
        }
        
        // Editor shortcuts (only when editor is focused)
        if (e.target.id === 'noteEditor' || document.activeElement === editor) {
            // Ctrl/Cmd + S - Save
            if (ctrlKey && e.key === 's') {
                e.preventDefault();
                saveNote();
                return;
            }
            
            // Ctrl/Cmd + B - Bold
            if (ctrlKey && e.key === 'b') {
                e.preventDefault();
                document.execCommand('bold', false, null);
                updateToolbarState();
                return;
            }
            
            // Ctrl/Cmd + I - Italic
            if (ctrlKey && e.key === 'i') {
                e.preventDefault();
                document.execCommand('italic', false, null);
                updateToolbarState();
                return;
            }
            
            // Ctrl/Cmd + U - Underline
            if (ctrlKey && e.key === 'u') {
                e.preventDefault();
                document.execCommand('underline', false, null);
                updateToolbarState();
                return;
            }
            
            // Ctrl/Cmd + Z - Undo
            if (ctrlKey && !shiftKey && e.key === 'z') {
                e.preventDefault();
                document.execCommand('undo', false, null);
                return;
            }
            
            // Ctrl/Cmd + Y or Ctrl/Cmd + Shift + Z - Redo
            if ((ctrlKey && e.key === 'y') || (ctrlKey && shiftKey && e.key === 'z')) {
                e.preventDefault();
                document.execCommand('redo', false, null);
                return;
            }
            
            // Ctrl/Cmd + Shift + X - Strikethrough
            if (ctrlKey && shiftKey && e.key === 'X') {
                e.preventDefault();
                document.execCommand('strikeThrough', false, null);
                updateToolbarState();
                return;
            }
            
            // Ctrl/Cmd + Shift + L - Left Align
            if (ctrlKey && shiftKey && e.key === 'L') {
                e.preventDefault();
                document.execCommand('justifyLeft', false, null);
                return;
            }
            
            // Ctrl/Cmd + Shift + E - Center Align
            if (ctrlKey && shiftKey && e.key === 'E') {
                e.preventDefault();
                document.execCommand('justifyCenter', false, null);
                return;
            }
            
            // Ctrl/Cmd + Shift + R - Right Align
            if (ctrlKey && shiftKey && e.key === 'R') {
                e.preventDefault();
                document.execCommand('justifyRight', false, null);
                return;
            }
            
            // Ctrl/Cmd + Shift + J - Justify
            if (ctrlKey && shiftKey && e.key === 'J') {
                e.preventDefault();
                document.execCommand('justifyFull', false, null);
                return;
            }
            
            // Ctrl/Cmd + ] - Indent
            if (ctrlKey && e.key === ']') {
                e.preventDefault();
                document.execCommand('indent', false, null);
                return;
            }
            
            // Ctrl/Cmd + [ - Outdent
            if (ctrlKey && e.key === '[') {
                e.preventDefault();
                document.execCommand('outdent', false, null);
                return;
            }
            
            // Ctrl/Cmd + Shift + 7 - Numbered List
            if (ctrlKey && shiftKey && e.key === '7') {
                e.preventDefault();
                document.execCommand('insertOrderedList', false, null);
                return;
            }
            
            // Ctrl/Cmd + Shift + 8 - Bullet List
            if (ctrlKey && shiftKey && e.key === '8') {
                e.preventDefault();
                document.execCommand('insertUnorderedList', false, null);
                return;
            }
        }
        
        // Global shortcuts (work anywhere)
        // Ctrl/Cmd + D - Duplicate Note
        if (ctrlKey && e.key === 'd' && e.target.id !== 'noteEditor') {
            e.preventDefault();
            duplicateNote();
            return;
        }
        
        // Esc - Close modals
        if (e.key === 'Escape') {
            const modals = ['shortcutsModal', 'notesModal', 'findReplaceModal', 'folderModal'];
            for (const modalId of modals) {
                const modal = document.getElementById(modalId);
                if (modal && modal.classList.contains('active')) {
                    modal.classList.remove('active');
                    if (modalId === 'findReplaceModal') {
                        closeFindReplace();
                    } else if (modalId === 'folderModal') {
                        closeFolderModal();
                    }
                    return;
                }
            }
        }
    });
}

// Show Keyboard Shortcuts Modal
function showShortcutsModal() {
    const modal = document.getElementById('shortcutsModal');
    if (modal) {
        // Detect Mac and show/hide appropriate shortcuts
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        
        // Update all shortcut displays
        modal.querySelectorAll('.shortcut-keys').forEach(keysEl => {
            const winKbds = Array.from(keysEl.children).filter(
                child => child.tagName === 'KBD' && !child.classList.contains('shortcut-mac')
            );
            const macSpan = keysEl.querySelector('.shortcut-mac');
            
            if (macSpan) {
                const macKbds = macSpan.querySelectorAll('kbd');
                
                if (isMac) {
                    // Show Mac shortcuts, hide Windows
                    winKbds.forEach(kbd => kbd.style.display = 'none');
                    macSpan.style.display = 'inline-flex';
                } else {
                    // Show Windows shortcuts, hide Mac
                    winKbds.forEach(kbd => kbd.style.display = 'inline-block');
                    macSpan.style.display = 'none';
                }
            }
        });
        
        modal.classList.add('active');
    }
}

// ==================== NEW FEATURES ====================

// Global variables for new features
let currentFilter = 'all';
let folders = [];
let selectedFolderId = null;

// Checklists/Todo Lists
function insertChecklist() {
    const editor = document.getElementById('noteEditor');
    const selection = window.getSelection();
    
    if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const checklistItem = document.createElement('div');
        checklistItem.className = 'checklist-item';
        checklistItem.contentEditable = 'true';
        checklistItem.innerHTML = '<input type="checkbox" class="checklist-checkbox"> <span class="checklist-text">Task item</span>';
        
        range.insertNode(checklistItem);
        range.setStartAfter(checklistItem);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        
        // Add event listener to checkbox
        const checkbox = checklistItem.querySelector('.checklist-checkbox');
        checkbox.addEventListener('change', function() {
            const textSpan = checklistItem.querySelector('.checklist-text');
            if (this.checked) {
                textSpan.style.textDecoration = 'line-through';
                textSpan.style.opacity = '0.6';
            } else {
                textSpan.style.textDecoration = 'none';
                textSpan.style.opacity = '1';
            }
            saveNote();
        });
        
        // Make text editable
        const textSpan = checklistItem.querySelector('.checklist-text');
        textSpan.addEventListener('blur', saveNote);
        
        updateToolbarState();
        saveNote();
    }
}

// Find & Replace
let findReplaceState = {
    currentIndex: -1,
    matches: []
};

function openFindReplace() {
    const modal = document.getElementById('findReplaceModal');
    modal.classList.add('active');
    document.getElementById('findInput').focus();
}

function closeFindReplace() {
    const modal = document.getElementById('findReplaceModal');
    modal.classList.remove('active');
    findReplaceState = { currentIndex: -1, matches: [] };
    highlightMatches([]);
}

function findText() {
    const findInput = document.getElementById('findInput').value;
    if (!findInput) return;
    
    const editor = document.getElementById('noteEditor');
    const text = editor.innerText || editor.textContent;
    const matchCase = document.getElementById('matchCase').checked;
    const wholeWords = document.getElementById('wholeWords').checked;
    
    let searchText = findInput;
    if (!matchCase) {
        searchText = searchText.toLowerCase();
    }
    
    const regex = wholeWords 
        ? new RegExp(`\\b${escapeRegex(searchText)}\\b`, matchCase ? 'g' : 'gi')
        : new RegExp(escapeRegex(searchText), matchCase ? 'g' : 'gi');
    
    findReplaceState.matches = [];
    let match;
    const textContent = editor.innerText || editor.textContent;
    let searchContent = matchCase ? textContent : textContent.toLowerCase();
    
    while ((match = regex.exec(searchContent)) !== null) {
        findReplaceState.matches.push({
            index: match.index,
            length: match[0].length
        });
    }
    
    if (findReplaceState.matches.length > 0) {
        findReplaceState.currentIndex = 0;
        highlightMatches(findReplaceState.matches);
        scrollToMatch(findReplaceState.matches[0]);
    } else {
        showNotification('No matches found', 'info');
    }
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightMatches(matches) {
    // Remove existing highlights
    const editor = document.getElementById('noteEditor');
    const highlights = editor.querySelectorAll('.find-highlight');
    highlights.forEach(h => {
        const parent = h.parentNode;
        parent.replaceChild(document.createTextNode(h.textContent), h);
        parent.normalize();
    });
    
    if (matches.length === 0) return;
    
    // Create range and highlight
    const text = editor.innerText || editor.textContent;
    const match = matches[findReplaceState.currentIndex];
    
    if (match) {
        const range = document.createRange();
        const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
        let charCount = 0;
        let startNode = null, endNode = null, startOffset = 0, endOffset = 0;
        
        while (walker.nextNode()) {
            const node = walker.currentNode;
            const nodeLength = node.textContent.length;
            
            if (!startNode && charCount + nodeLength >= match.index) {
                startNode = node;
                startOffset = match.index - charCount;
            }
            
            if (!endNode && charCount + nodeLength >= match.index + match.length) {
                endNode = node;
                endOffset = match.index + match.length - charCount;
                break;
            }
            
            charCount += nodeLength;
        }
        
        if (startNode && endNode) {
            range.setStart(startNode, startOffset);
            range.setEnd(endNode, endOffset);
            const highlight = document.createElement('mark');
            highlight.className = 'find-highlight';
            highlight.style.backgroundColor = '#ffeb3b';
            try {
                range.surroundContents(highlight);
            } catch (e) {
                // Fallback if surroundContents fails
                const contents = range.extractContents();
                highlight.appendChild(contents);
                range.insertNode(highlight);
            }
            
            highlight.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
}

function scrollToMatch(match) {
    // Scroll logic handled in highlightMatches
}

function findNext() {
    if (findReplaceState.matches.length === 0) {
        findText();
        return;
    }
    
    findReplaceState.currentIndex = (findReplaceState.currentIndex + 1) % findReplaceState.matches.length;
    highlightMatches(findReplaceState.matches);
    scrollToMatch(findReplaceState.matches[findReplaceState.currentIndex]);
}

function replaceText() {
    const replaceInput = document.getElementById('replaceInput').value;
    if (findReplaceState.matches.length === 0 || findReplaceState.currentIndex < 0) {
        findText();
        return;
    }
    
    const editor = document.getElementById('noteEditor');
    const match = findReplaceState.matches[findReplaceState.currentIndex];
    const text = editor.innerText || editor.textContent;
    
    // Simple replace - in production, use proper DOM manipulation
    const before = text.substring(0, match.index);
    const after = text.substring(match.index + match.length);
    const newText = before + replaceInput + after;
    
    editor.textContent = newText;
    saveNote();
    findText(); // Refresh search
}

function replaceAll() {
    const findInput = document.getElementById('findInput').value;
    const replaceInput = document.getElementById('replaceInput').value;
    if (!findInput) return;
    
    const editor = document.getElementById('noteEditor');
    const text = editor.innerText || editor.textContent;
    const matchCase = document.getElementById('matchCase').checked;
    const wholeWords = document.getElementById('wholeWords').checked;
    
    let searchText = findInput;
    const regex = wholeWords 
        ? new RegExp(`\\b${escapeRegex(searchText)}\\b`, matchCase ? 'g' : 'gi')
        : new RegExp(escapeRegex(searchText), matchCase ? 'g' : 'gi');
    
    const newText = text.replace(regex, replaceInput);
    editor.textContent = newText;
    saveNote();
    showNotification('Replaced all occurrences', 'success');
}

// Folder Selection
function toggleFolderSelect() {
    // Check if user is logged in
    if (!currentUserEmail) {
        showNotification('Please sign in to organize notes in folders', 'error');
        return;
    }
    
    const container = document.getElementById('noteFolderContainer');
    container.style.display = container.style.display === 'none' ? 'block' : 'none';
    if (container.style.display === 'block') {
        updateFolderSelect();
    }
}

function updateFolderSelect() {
    const select = document.getElementById('noteFolderSelect');
    if (!select) return; // Exit if folder select doesn't exist
    
    const currentFolderId = currentNoteId ? (notes.find(n => n.id == currentNoteId)?.folder_id || null) : null;
    
    // Clear existing options except "No Folder"
    select.innerHTML = '<option value="">No Folder</option>';
    
    // Add folder options
    folders.forEach(folder => {
        const option = document.createElement('option');
        option.value = folder.id;
        option.textContent = folder.name;
        option.selected = (currentFolderId == folder.id);
        select.appendChild(option);
    });
}

async function saveFolderSelection() {
    if (!currentNoteId) return;
    
    // Check if user is logged in
    if (!currentUserEmail) {
        showNotification('Please sign in to organize notes in folders', 'error');
        return;
    }
    
    const folderSelect = document.getElementById('noteFolderSelect');
    if (!folderSelect) return; // Exit if folder select doesn't exist
    
    const folderId = folderSelect.value ? parseInt(folderSelect.value) : null;
    
    // Update the note's folder_id
    const formData = new FormData();
    formData.append('id', currentNoteId);
    formData.append('title', document.getElementById('noteTitle').value);
    formData.append('content', document.getElementById('noteEditor').innerHTML);
    formData.append('folder_id', folderId || '');
    formData.append('is_pinned', document.getElementById('pinNoteBtn')?.querySelector('i.fas') ? 1 : 0);
    
    try {
        const response = await fetch('save.php', {
            method: 'POST',
            body: formData,
            credentials: 'include'
        });
        const result = await response.json();
        if (result.success) {
            loadNotes();
        }
    } catch (error) {
        console.error('Error saving folder:', error);
    }
}

// Folders
async function loadFolders() {
    try {
        const response = await fetch('folders.php', {
            method: 'GET',
            credentials: 'include'
        });
        
        if (!response.ok) {
            console.error('Failed to load folders:', response.status, response.statusText);
            // Still display folders (might be empty) to ensure UI is updated
            displayFolders();
            return;
        }
        
        const result = await response.json();
        console.log('loadFolders response:', result);
        if (result.success) {
            folders = result.folders || [];
            console.log('Folders loaded:', folders.length, folders);
            console.log('User session check - folders response success:', result.success);
            displayFolders();
            // Update folder select if it's visible
            const noteFolderContainer = document.getElementById('noteFolderContainer');
            if (noteFolderContainer && noteFolderContainer.style.display !== 'none') {
                updateFolderSelect();
            }
        } else {
            console.error('Error loading folders:', result.message);
            // Still display folders (might be empty) to ensure UI is updated
            displayFolders();
        }
    } catch (error) {
        console.error('Error loading folders:', error);
        // Still display folders (might be empty) to ensure UI is updated
        displayFolders();
    }
}

function displayFolders() {
    const foldersList = document.getElementById('foldersList');
    if (!foldersList) {
        console.error('foldersList element not found!');
        return;
    }
    
    if (!folders || folders.length === 0) {
        foldersList.innerHTML = '<div class="no-folders">No folders yet</div>';
        return;
    }
    
    console.log('Displaying folders:', folders.length, folders);
    
    // Ensure folder IDs are numbers
    const foldersHtml = folders.map(folder => {
        const folderId = parseInt(folder.id);
        const folderColor = folder.color || '#6366f1'; // Default color if none set
        const folderName = folder.name || 'Unnamed Folder';
        return `
        <div class="folder-item" data-id="${folderId}">
            <div class="nav-icon" style="color: ${folderColor};"><i class="fas fa-folder"></i></div>
            <span>${escapeHtml(folderName)}</span>
            <div class="folder-actions">
                <button class="folder-action-btn" onclick="deleteFolder(${folderId}, event)" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `;
    }).join('');
    
    foldersList.innerHTML = foldersHtml;
    
    foldersList.querySelectorAll('.folder-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (!e.target.closest('.folder-actions')) {
                selectedFolderId = parseInt(item.dataset.id);
                currentFilter = 'folder';
                setActiveNavItem(null);
                loadNotesWithFilter('folder', selectedFolderId);
                closeNotesModal();
            }
        });
    });
}

function openFolderModal() {
    document.getElementById('folderModalTitle').innerHTML = '<i class="fas fa-folder"></i> New Folder';
    document.getElementById('folderNameInput').value = '';
    
    // Select first color by default
    const colorOptions = document.querySelectorAll('#folderColorPicker .color-option');
    colorOptions.forEach(o => o.classList.remove('selected'));
    if (colorOptions.length > 0) {
        colorOptions[0].classList.add('selected');
    }
    
    document.getElementById('folderModal').classList.add('active');
    document.getElementById('folderNameInput').focus();
}

function closeFolderModal() {
    document.getElementById('folderModal').classList.remove('active');
}

async function saveFolder() {
    const name = document.getElementById('folderNameInput').value.trim();
    const colorEl = document.querySelector('#folderColorPicker .color-option.selected');
    const color = colorEl ? colorEl.dataset.color : '#6366f1';
    
    if (!name) {
        showNotification('Folder name is required', 'error');
        return;
    }
    
    // Check if user is signed in
    if (!currentUserEmail) {
        showNotification('Please sign in to create folders', 'error');
        return;
    }
    
    const formData = new FormData();
    formData.append('action', 'create');
    formData.append('name', name);
    formData.append('color', color);
    
    console.log('Creating folder with name:', name, 'color:', color, 'user:', currentUserEmail);
    
    try {
        const response = await fetch('folders.php', {
            method: 'POST',
            body: formData,
            credentials: 'include'
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const text = await response.text();
        let result;
        try {
            result = JSON.parse(text);
        } catch (parseError) {
            console.error('JSON parse error:', parseError, 'Response text:', text);
            showNotification('Invalid response from server', 'error');
            return;
        }
        
        console.log('Folder creation response:', result);
        console.log('Folder object in response:', result.folder);
        
        if (result.success) {
            // Save folder name and color before clearing inputs
            const folderName = document.getElementById('folderNameInput').value.trim();
            const colorEl = document.querySelector('#folderColorPicker .color-option.selected');
            const color = colorEl ? colorEl.dataset.color : '#6366f1';
            
            showNotification('Folder created', 'success');
            closeFolderModal();
            // Clear the input
            document.getElementById('folderNameInput').value = '';
            
            // Optimistically add the folder to the local array if provided
            if (result.folder) {
                console.log('Adding folder optimistically:', result.folder);
                // Check if folder already exists to avoid duplicates
                const exists = folders.some(f => f.id === result.folder.id);
                if (!exists) {
                    folders.push(result.folder);
                    displayFolders();
                    console.log('Folders after optimistic add:', folders);
                }
            } else {
                console.warn('No folder object in response, result keys:', Object.keys(result));
                // Try to construct folder from result.id if available
                if (result.id) {
                    const newFolder = {
                        id: result.id,
                        name: folderName || 'New Folder',
                        parent_id: null,
                        color: color
                    };
                    const exists = folders.some(f => f.id === newFolder.id);
                    if (!exists) {
                        folders.push(newFolder);
                        displayFolders();
                        console.log('Created folder from result.id:', newFolder);
                    }
                }
            }
            
            // Small delay to ensure database transaction is committed
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Reload folders from server to ensure sync - wait for it to complete
            await loadFolders();
            console.log('Folders after creation:', folders);
        } else {
            showNotification(result.message || 'Error creating folder', 'error');
            console.error('Folder creation failed:', result.message);
        }
    } catch (error) {
        console.error('Error creating folder:', error);
        showNotification('Error creating folder: ' + error.message, 'error');
    }
}

// Make deleteFolder globally accessible
window.deleteFolder = async function(id, event) {
    if (event) {
        event.stopPropagation();
    }
    
    // Get folder name for better confirmation message
    const folder = folders.find(f => f.id == id);
    const folderName = folder ? folder.name : 'this folder';
    
    // Check how many notes are in this folder
    const notesInFolder = notes.filter(n => n.folder_id == id && !n.is_deleted).length;
    
    let confirmMessage;
    if (notesInFolder > 0) {
        confirmMessage = `Delete "${folderName}"?\n\nThis folder contains ${notesInFolder} note(s). They will be moved to "No Folder" and not deleted.\n\nContinue?`;
    } else {
        confirmMessage = `Delete "${folderName}"?\n\nThis folder is empty.`;
    }
    
    if (!confirm(confirmMessage)) {
        return;
    }
    
    const formData = new FormData();
    formData.append('action', 'delete');
    formData.append('id', id);
    formData.append('move_notes', '1'); // Automatically move notes to "No Folder"
    
    try {
        const response = await fetch('folders.php', {
            method: 'POST',
            body: formData,
            credentials: 'include'
        });
        const result = await response.json();
        if (result.success) {
            const message = result.moved_notes 
                ? `Folder deleted. ${result.moved_notes} note(s) moved to "No Folder".`
                : 'Folder deleted';
            showNotification(message, 'success');
            loadFolders();
            // Reload notes to update folder display
            loadNotes();
        } else {
            showNotification(result.message || 'Error deleting folder', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('Error deleting folder', 'error');
    }
}

// Pin/Unpin Note
async function togglePin() {
    if (!currentNoteId) return;
    
    const pinBtn = document.getElementById('pinNoteBtn');
    if (!pinBtn) return; // Exit if pin button doesn't exist
    
    const isPinned = pinBtn.classList.contains('pinned');
    const newPinState = isPinned ? 0 : 1;
    
    // If user is not logged in, update in localStorage
    if (!currentUserEmail || (currentNoteId && currentNoteId.toString().startsWith('local_'))) {
    try {
            const localNotes = localStorage.getItem('anotepad_notes');
            if (localNotes) {
                let notes = JSON.parse(localNotes);
                const noteIndex = notes.findIndex(n => n.id === currentNoteId);
                if (noteIndex !== -1) {
                    notes[noteIndex].is_pinned = newPinState;
                    localStorage.setItem('anotepad_notes', JSON.stringify(notes));
                    
                    // Update button state
            if (newPinState) {
                        pinBtn.classList.add('pinned');
            } else {
                        pinBtn.classList.remove('pinned');
            }
            loadNotes();
            // Update pinned dropdown if open
            if (document.getElementById('pinnedNotesMenu')?.style.display === 'block') {
                loadPinnedNotesDropdown();
                    }
            }
        }
    } catch (error) {
            console.error('Error toggling pin in localStorage:', error);
    }
        return;
    }
    
    // User is logged in - update on server
    const formData = new FormData();
    formData.append('id', currentNoteId);
    formData.append('pin', newPinState);
    
    try {
        const response = await fetch('pin.php', {
            method: 'POST',
            body: formData,
            credentials: 'include'
        });
        const result = await response.json();
        if (result.success) {
            // Update button state
            if (newPinState) {
                pinBtn.classList.add('pinned');
            } else {
                pinBtn.classList.remove('pinned');
            }
            loadNotes();
            // Update pinned dropdown if open
            if (document.getElementById('pinnedNotesMenu')?.style.display === 'block') {
                loadPinnedNotesDropdown();
            }
        }
    } catch (error) {
        console.error('Error:', error);
    }
}



// Export functions
function stripHtml(html) {
    const tmp = document.createElement('DIV');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
}

async function exportNote(format) {
    const title = document.getElementById('noteTitle').value.trim() || 'Untitled Note';
    const content = document.getElementById('noteEditor').innerHTML;
    const textContent = document.getElementById('noteEditor').innerText || document.getElementById('noteEditor').textContent;
    
    if (!textContent.trim() && !currentNoteId) {
        showNotification('No note to export', 'error');
        return;
    }
    
    // If user is not logged in or note is from local storage, export directly
    if (!currentUserEmail || (currentNoteId && currentNoteId.toString().startsWith('local_'))) {
        try {
            if (format === 'pdf') {
                // Create HTML for PDF printing
                const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${escapeHtml(title)}</title>
    <style>
        @media print {
            @page { margin: 2cm; }
        }
        body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 40px auto;
            padding: 20px;
            line-height: 1.6;
            color: #333;
        }
        h1 {
            color: #333;
            border-bottom: 2px solid #6366f1;
            padding-bottom: 10px;
            margin-bottom: 20px;
        }
        p { margin: 1em 0; }
        ul, ol { margin: 1em 0; padding-left: 2em; }
        img { max-width: 100%; height: auto; }
    </style>
</head>
<body>
    <h1>${escapeHtml(title)}</h1>
    <div>${content}</div>
</body>
</html>`;
                
                const printWindow = window.open('', '_blank');
                printWindow.document.write(html);
                printWindow.document.close();
                
                printWindow.onload = function() {
                    printWindow.print();
                };
            } else if (format === 'txt') {
                // Export as plain text
                const text = `${title}\n\n${textContent}`;
                const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${title.replace(/[^a-z0-9]/gi, '_')}.txt`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
                showNotification('Note exported as TXT', 'success');
            } else if (format === 'docx') {
                // Export as HTML that Word can open
                const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
    <meta charset="UTF-8">
    <title>${escapeHtml(title)}</title>
    <!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
        h1 { color: #333; border-bottom: 2px solid #6366f1; padding-bottom: 10px; }
        p { margin: 1em 0; }
        ul, ol { margin: 1em 0; padding-left: 2em; }
        img { max-width: 100%; height: auto; }
    </style>
</head>
<body>
    <h1>${escapeHtml(title)}</h1>
    <div>${content}</div>
</body>
</html>`;
                
                const blob = new Blob([html], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${title.replace(/[^a-z0-9]/gi, '_')}.docx`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
                showNotification('Note exported as DOCX', 'success');
            }
        } catch (error) {
            console.error(`Error exporting ${format}:`, error);
            showNotification(`Error exporting ${format.toUpperCase()}`, 'error');
        }
        return;
    }
    
    // User is logged in - use server export
    if (!currentNoteId) {
        showNotification('No note selected', 'error');
        return;
    }
    
    try {
        const response = await fetch(`export.php?format=${format}&id=${currentNoteId}`);
        
        if (format === 'pdf') {
            const result = await response.json();
            if (result.success) {
                // Create a new window with the HTML content
                const printWindow = window.open('', '_blank');
                printWindow.document.write(result.html);
                printWindow.document.close();
                
                // Wait for content to load, then print
                printWindow.onload = function() {
                    printWindow.print();
                };
            }
        } else {
            // For DOCX and TXT, download the file
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            
            // Get filename from response headers or use default
            const contentDisposition = response.headers.get('Content-Disposition');
            let filename = `note_${currentNoteId}.${format}`;
            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename="(.+)"/);
                if (filenameMatch) {
                    filename = filenameMatch[1];
                }
            }
            
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            
            showNotification(`Note exported as ${format.toUpperCase()}`, 'success');
        }
    } catch (error) {
        console.error(`Error exporting ${format}:`, error);
        showNotification(`Error exporting ${format.toUpperCase()}`, 'error');
    }
}

// Export dropdown toggle
function toggleExportDropdown() {
    const dropdown = document.getElementById('exportDropdown');
    if (dropdown) {
        dropdown.classList.toggle('active');
    }
}

// Close export dropdown when clicking outside
document.addEventListener('click', (e) => {
    const exportContainer = document.querySelector('.export-dropdown-container');
    const dropdown = document.getElementById('exportDropdown');
    if (exportContainer && dropdown && !exportContainer.contains(e.target)) {
        dropdown.classList.remove('active');
    }
});

// Load Notes with Filter
async function loadNotesWithFilter(filterType, filterValue) {
    // If user is not logged in, filter local storage notes
    if (!currentUserEmail) {
        try {
            const localNotes = localStorage.getItem('anotepad_notes');
            if (localNotes) {
                let allNotes = JSON.parse(localNotes);
                
                // Apply filters
                if (filterType === 'filter') {
                    if (filterValue === 'pinned') {
                        allNotes = allNotes.filter(n => n.is_pinned && !n.is_deleted);
                    } else if (filterValue === 'trash') {
                        allNotes = allNotes.filter(n => n.is_deleted);
                    } else {
                        allNotes = allNotes.filter(n => !n.is_deleted);
                    }
                }
                
                notes = allNotes;
                filteredNotes = [...notes];
                displayNotes();
                
                // Update pinned notes dropdown if it's open
                if (document.getElementById('pinnedNotesMenu')?.style.display === 'block') {
                    loadPinnedNotesDropdown();
                }
            } else {
                notes = [];
                filteredNotes = [];
                displayNotes();
            }
        } catch (error) {
            console.error('Error loading notes from localStorage:', error);
            notes = [];
            filteredNotes = [];
            displayNotes();
        }
        return;
    }
    
    // User is logged in - load from server
    try {
        let url = 'load.php?action=list';
        if (filterType === 'folder') {
            url += `&folder_id=${filterValue}`;
        } else if (filterType === 'filter') {
            url += `&filter=${filterValue}`;
        } else if (filterType === 'recent') {
            url += `&filter=recent`;
        } else if (filterType === 'favorites') {
            url += `&filter=favorites`;
        }
        
        const response = await fetch(url);
        const result = await response.json();
        
        if (result.success) {
            notes = result.notes || [];
            folders = result.folders || folders;
            filteredNotes = [...notes];
            displayNotes();
            displayFolders();
            // Update pinned notes dropdown if it's open
            if (document.getElementById('pinnedNotesMenu')?.style.display === 'block') {
                loadPinnedNotesDropdown();
            }
        }
    } catch (error) {
        console.error('Error loading notes:', error);
    }
}

// Enhanced loadNotes to use filter function
loadNotes = function() {
    loadNotesWithFilter('all', null);
};

// Enhanced displayNotes with pins, tags, and folders
displayNotes = function() {
    const notesList = document.getElementById('notesList');
    
    if (filteredNotes.length === 0) {
        notesList.innerHTML = `
            <div style="text-align: center; padding: 3rem; color: var(--text-secondary);">
                <i class="fas fa-sticky-note" style="font-size: 3rem; opacity: 0.3; margin-bottom: 1rem;"></i>
                <p>No notes found</p>
                <p style="font-size: 0.9rem; margin-top: 0.5rem; opacity: 0.7;">Create your first note to get started!</p>
            </div>
        `;
        return;
    }
    
    notesList.innerHTML = filteredNotes.map((note, index) => {
        const pinIcon = note.is_pinned ? '<svg class="pin-icon note-pin-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="currentColor"/></svg>' : '';
        
        // Get folder name if note has a folder
        let folderHtml = '';
        if (note.folder_id) {
            const folder = folders.find(f => f.id == note.folder_id);
            if (folder) {
                folderHtml = `<div class="note-item-folder" style="border-left-color: ${folder.color || '#6366f1'}">
                    <i class="fas fa-folder"></i>
                    <span>${escapeHtml(folder.name)}</span>
                </div>`;
            }
        }
        
        return `
            <div class="note-item ${note.id == currentNoteId ? 'active' : ''} ${note.is_pinned ? 'pinned' : ''}" data-id="${note.id}">
                ${pinIcon}
                <div class="note-item-title">${escapeHtml(note.title)}</div>
                <div class="note-item-preview">${escapeHtml(note.preview || 'No content')}</div>
                ${folderHtml}
                <div class="note-item-date">${formatDate(note.created_at)}</div>
            </div>
        `;
    }).join('');
    
    // Add click listeners
    notesList.querySelectorAll('.note-item').forEach(item => {
        item.addEventListener('click', () => {
            const id = item.dataset.id;
            loadNote(id);
            // Only close modal if it's open
            const notesModal = document.getElementById('notesModal');
            if (notesModal && notesModal.classList.contains('active')) {
                closeNotesModal();
            }
        });
    });
};

// Restore last opened note on page load
async function restoreLastOpenedNote() {
    try {
        // Check if user is logged in
        if (currentUserEmail) {
            // For logged-in users, try to restore from server
            const lastNoteId = localStorage.getItem('anotepad_last_note_id');
            if (lastNoteId && lastNoteId !== 'null') {
                // Verify note still exists
                const response = await fetch(`load.php?action=single&id=${lastNoteId}`);
                const result = await response.json();
                if (result.success && result.note) {
                    // Load the note
                    await loadNote(lastNoteId);
                    return;
                }
            }
        } else {
            // For non-logged-in users, restore from localStorage
            const lastNoteId = localStorage.getItem('anotepad_last_note_id');
            if (lastNoteId && lastNoteId !== 'null') {
                const localNotes = localStorage.getItem('anotepad_notes');
                if (localNotes) {
                    const notes = JSON.parse(localNotes);
                    const note = notes.find(n => n.id === lastNoteId);
                    if (note) {
                        // Load the note
                        await loadNote(lastNoteId);
                        return;
                    }
                }
            }
            
            // Fallback: try to restore from backup content
            const backupContent = localStorage.getItem('anotepad_last_note_content');
            if (backupContent) {
                try {
                    const backup = JSON.parse(backupContent);
                    if (backup.content || backup.title !== 'Untitled Document') {
                        // Restore content
                        document.getElementById('noteTitle').value = backup.title || 'Untitled Document';
                        document.getElementById('noteEditor').innerHTML = backup.content || '';
                        updateWordCount();
                        // Try to save it as a new note
                        if (backup.id && backup.id.startsWith('local_')) {
                            currentNoteId = backup.id;
                            saveNote();
                        }
                    }
                } catch (e) {
                    console.error('Error restoring backup content:', e);
                }
            }
        }
    } catch (error) {
        console.error('Error restoring last note:', error);
    }
}

// Enhanced loadNote to load tags, pin state, and folder
loadNote = async function(id) {
    try {
        const editor = document.getElementById('noteEditor');
        editor.style.opacity = '0.5';
        editor.style.pointerEvents = 'none';
        
        // Save current note ID to localStorage
        if (id) {
            localStorage.setItem('anotepad_last_note_id', id);
        }
        
        // If user is not logged in or note ID starts with 'local_', load from localStorage
        if (!currentUserEmail || (id && id.toString().startsWith('local_'))) {
            const localNotes = localStorage.getItem('anotepad_notes');
            if (localNotes) {
                const notes = JSON.parse(localNotes);
                const note = notes.find(n => n.id === id);
                if (note) {
                    currentNoteId = note.id;
                    document.getElementById('noteTitle').value = note.title;
                    
                    // Show note meta buttons (but disable pin for local notes)
                    document.getElementById('noteMeta').style.display = 'flex';
                    
                    // Update pin button
                    const pinBtn = document.getElementById('pinNoteBtn');
                    if (pinBtn) {
                        if (note.is_pinned) {
                            pinBtn.classList.add('pinned');
                        } else {
                            pinBtn.classList.remove('pinned');
                        }
                    }
                    
                    setTimeout(() => {
                        document.getElementById('noteEditor').innerHTML = note.content;
                        
                        // Update last saved content
                        lastSavedContent = note.content;
                        lastSavedTitle = note.title;
                        
                        // Re-attach checklist event listeners
                        document.querySelectorAll('.checklist-item .checklist-checkbox').forEach(checkbox => {
                            checkbox.addEventListener('change', function() {
                                const textSpan = this.parentElement.querySelector('.checklist-text');
                                if (this.checked) {
                                    textSpan.style.textDecoration = 'line-through';
                                    textSpan.style.opacity = '0.6';
                                } else {
                                    textSpan.style.textDecoration = 'none';
                                    textSpan.style.opacity = '1';
                                }
                                saveNote();
                            });
                        });
                        
                        editor.style.transition = 'all 0.3s ease';
                        editor.style.opacity = '1';
                        editor.style.pointerEvents = 'auto';
                        updateWordCount();
                        displayNotes();
                    }, 200);
                    return;
                }
            }
            editor.style.opacity = '1';
            editor.style.pointerEvents = 'auto';
            showNotification('Note not found', 'error');
            return;
        }
        
        // User is logged in - load from server
        const response = await fetch(`load.php?action=single&id=${id}`);
        const result = await response.json();
        
        if (result.success && result.note) {
            currentNoteId = result.note.id;
            document.getElementById('noteTitle').value = result.note.title;
            
            // Show note meta buttons
            document.getElementById('noteMeta').style.display = 'flex';
            
            // Update pin button
            const pinBtn = document.getElementById('pinNoteBtn');
            if (pinBtn) {
                if (result.note.is_pinned) {
                    pinBtn.classList.add('pinned');
                } else {
                    pinBtn.classList.remove('pinned');
                }
            }
            
            // Load folder
            updateFolderSelect();
            const folderSelect = document.getElementById('noteFolderSelect');
            if (folderSelect) {
                if (result.note.folder_id) {
                    folderSelect.value = result.note.folder_id;
                } else {
                    folderSelect.value = '';
                }
            }
            
            setTimeout(() => {
                const loadedContent = result.note.content;
                const loadedTitle = result.note.title;
                
                document.getElementById('noteEditor').innerHTML = loadedContent;
                
                // Update last saved content to match loaded content
                lastSavedContent = loadedContent;
                lastSavedTitle = loadedTitle;
                
                // Re-attach checklist event listeners
                document.querySelectorAll('.checklist-item .checklist-checkbox').forEach(checkbox => {
                    checkbox.addEventListener('change', function() {
                        const textSpan = this.parentElement.querySelector('.checklist-text');
                        if (this.checked) {
                            textSpan.style.textDecoration = 'line-through';
                            textSpan.style.opacity = '0.6';
                        } else {
                            textSpan.style.textDecoration = 'none';
                            textSpan.style.opacity = '1';
                        }
                        saveNote();
                    });
                });
                
                editor.style.transition = 'all 0.3s ease';
                editor.style.opacity = '1';
                editor.style.pointerEvents = 'auto';
                updateWordCount();
                displayNotes();
            }, 200);
        } else {
            editor.style.opacity = '1';
            editor.style.pointerEvents = 'auto';
        }
    } catch (error) {
        console.error('Error loading note:', error);
        showNotification('Error loading note', 'error');
        document.getElementById('noteEditor').style.opacity = '1';
        document.getElementById('noteEditor').style.pointerEvents = 'auto';
    }
};

// Save Note - Full implementation with all features
saveNote = async function() {
    const titleInput = document.getElementById('noteTitle');
    const editor = document.getElementById('noteEditor');
    
    if (!titleInput || !editor) {
        console.error('Editor elements not found');
        return;
    }
    
    const title = titleInput.value.trim() || 'Untitled Note';
    const content = editor.innerHTML;
    const textContent = editor.innerText || editor.textContent;
    const isPinned = document.getElementById('pinNoteBtn')?.classList.contains('pinned') ? 1 : 0;
    
    // Don't save if it's a completely empty new note
    if (!textContent.trim() && title.trim() === 'Untitled Note' && !currentNoteId) {
        return;
    }
    
    // If user is not logged in, save to localStorage
    if (!currentUserEmail) {
        try {
            // Load existing notes from localStorage
            let localNotes = [];
            const stored = localStorage.getItem('anotepad_notes');
            if (stored) {
                localNotes = JSON.parse(stored);
            }
            
            const now = new Date().toISOString();
            const preview = textContent.substring(0, 100) + (textContent.length > 100 ? '...' : '');
            
            if (currentNoteId) {
                // Update existing note
                const noteIndex = localNotes.findIndex(n => n.id === currentNoteId);
                if (noteIndex !== -1) {
                    const oldContent = localNotes[noteIndex].content;
                    
                    // Create version if content changed significantly (more than 10% different)
                    if (oldContent !== content) {
                        // Calculate similarity
                        const similarity = calculateSimilarity(oldContent, content);
                        if (similarity < 90) {
                            // Save version to localStorage
                            saveVersionToLocalStorage(currentNoteId, localNotes[noteIndex].title, oldContent, now);
                        }
                    }
                    
                    localNotes[noteIndex] = {
                        ...localNotes[noteIndex],
                        title: title,
                        content: content,
                        preview: preview,
                        is_pinned: isPinned,
                        updated_at: now
                    };
                }
            } else {
                // Create new note
                const newId = 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                const newNote = {
                    id: newId,
                    title: title,
                    content: content,
                    preview: preview,
                    is_pinned: isPinned,
                    is_archived: 0,
                    is_deleted: 0,
                    folder_id: null,
                    created_at: now,
                    updated_at: now
                };
                localNotes.unshift(newNote);
                currentNoteId = newId;
            }
            
            // Save to localStorage
            localStorage.setItem('anotepad_notes', JSON.stringify(localNotes));
            
            // Update last saved content
            lastSavedContent = content;
            lastSavedTitle = title;
            updateLastSaved('Saved locally');
            
            // Reload notes
            loadNotes();
            
            // Update pinned dropdown if open
            if (document.getElementById('pinnedNotesMenu')?.style.display === 'block') {
                loadPinnedNotesDropdown();
            }
            
            return true;
        } catch (error) {
            console.error('Error saving note to localStorage:', error);
            return false;
        }
    }
    
    // User is logged in - save to server
    try {
        const folderSelect = document.getElementById('noteFolderSelect');
        const folderId = folderSelect && folderSelect.value ? parseInt(folderSelect.value) : null;
        
        const formData = new FormData();
        formData.append('id', currentNoteId || '');
        formData.append('title', title);
        formData.append('content', content);
        formData.append('folder_id', folderId || '');
        formData.append('is_pinned', isPinned);
        
        const response = await fetch('save.php', {
            method: 'POST',
            body: formData,
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const responseText = await response.text();
        let result;
        
        try {
            result = JSON.parse(responseText);
        } catch (parseError) {
            console.error('JSON parse error:', parseError);
            console.error('Response text:', responseText);
            throw new Error('Invalid response from server');
        }
        
        if (result.success) {
            currentNoteId = result.id;
            // Update last saved content
            lastSavedContent = content;
            lastSavedTitle = title;
            updateLastSaved('Saved just now');
            // Silently reload notes (don't show notification for auto-save)
            loadNotes();
            // Update pinned dropdown if open
            if (document.getElementById('pinnedNotesMenu')?.style.display === 'block') {
                loadPinnedNotesDropdown();
            }
            return true;
        } else {
            console.error('Save failed:', result.message);
            // Only show notification if it's a manual save (not auto-save)
            // We can detect this by checking if there's user interaction
            throw new Error(result.message || 'Unknown error');
        }
    } catch (error) {
        console.error('Error saving note:', error);
        // Only show notification for manual saves, not auto-saves
        // Auto-save errors are logged but don't interrupt the user
        return false;
    }
};

// Add event listeners for new features
document.addEventListener('DOMContentLoaded', () => {
    // Checklist button
    const checklistBtn = document.getElementById('checklistBtn');
    if (checklistBtn) {
        checklistBtn.addEventListener('click', insertChecklist);
    }
    
    // Find & Replace
    const findReplaceBtn = document.getElementById('findReplaceBtn');
    if (findReplaceBtn) {
        findReplaceBtn.addEventListener('click', openFindReplace);
    }
    
    const closeFindReplaceBtn = document.getElementById('closeFindReplaceModal');
    if (closeFindReplaceBtn) {
        closeFindReplaceBtn.addEventListener('click', closeFindReplace);
    }
    
    document.getElementById('findNextBtn')?.addEventListener('click', findNext);
    document.getElementById('replaceBtn')?.addEventListener('click', replaceText);
    document.getElementById('replaceAllBtn')?.addEventListener('click', replaceAll);
    document.getElementById('findInput')?.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') findNext();
    });
    
    // Folder Selection
    document.getElementById('folderToggleBtn')?.addEventListener('click', toggleFolderSelect);
    document.getElementById('noteFolderSelect')?.addEventListener('change', saveFolderSelection);
    
    // Folders
    document.getElementById('addFolderBtn')?.addEventListener('click', openFolderModal);
    document.getElementById('closeFolderModal')?.addEventListener('click', closeFolderModal);
    document.getElementById('saveFolderBtn')?.addEventListener('click', saveFolder);
    document.getElementById('cancelFolderBtn')?.addEventListener('click', closeFolderModal);
    
    // Color picker
    document.querySelectorAll('#folderColorPicker .color-option').forEach(option => {
        option.addEventListener('click', function() {
            document.querySelectorAll('#folderColorPicker .color-option').forEach(o => o.classList.remove('selected'));
            this.classList.add('selected');
        });
    });
    
    // Allow Enter key to save folder
    document.getElementById('folderNameInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveFolder();
        }
    });
    
    // Pin
    document.getElementById('pinNoteBtn')?.addEventListener('click', togglePin);
    
    // Export dropdown
    const exportBtn = document.getElementById('exportBtn');
    const exportDropdown = document.getElementById('exportDropdown');
    
    exportBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleExportDropdown();
    });
    
    // Export option clicks
    exportDropdown?.querySelectorAll('.export-option').forEach(option => {
        option.addEventListener('click', (e) => {
            e.stopPropagation();
            const format = option.dataset.format;
            exportNote(format);
            exportDropdown.classList.remove('active');
        });
    });
    
    // Sign In button
    const signInBtn = document.getElementById('signInBtn');
    if (signInBtn) {
        signInBtn.addEventListener('click', (e) => {
            e.preventDefault();
            openSignInModal();
        });
    }
    
    // User menu toggle
    const userMenuBtn = document.getElementById('userMenuBtn');
    const userDropdownMenu = document.getElementById('userDropdownMenu');
    const userMenuContainer = document.getElementById('userMenuContainer');
    
    if (userMenuBtn && userDropdownMenu) {
        userMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = userDropdownMenu.classList.contains('active');
            if (isOpen) {
                userDropdownMenu.classList.remove('active');
            } else {
                userDropdownMenu.classList.add('active');
            }
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (userMenuContainer && !userMenuContainer.contains(e.target)) {
                userDropdownMenu.classList.remove('active');
            }
        });
    }
    
    // Sign Out button
    const signOutBtn = document.getElementById('signOutBtn');
    if (signOutBtn) {
        signOutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (userDropdownMenu) {
                userDropdownMenu.classList.remove('active');
            }
            handleSignOut();
        });
    }
    document.getElementById('closeSignInModal')?.addEventListener('click', closeSignInModal);
    
    // Close modal when clicking outside
    document.getElementById('signInModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'signInModal' || e.target.classList.contains('popup-modal-overlay')) {
            closeSignInModal();
        }
    });
    
    // Auth form handler
    const authForm = document.getElementById('authForm');
    const authSwitchLink = document.getElementById('authSwitchLink');
    
    if (authForm) {
        authForm.addEventListener('submit', handleAuthSubmit);
    }
    
    if (authSwitchLink) {
        authSwitchLink.addEventListener('click', (e) => {
            e.preventDefault();
            toggleAuthMode();
        });
    }
    
    // Pinned notes dropdown
    const pinnedDropdown = document.getElementById('pinnedNotesDropdown');
    const pinnedBtn = document.getElementById('pinnedNotesBtn');
    const pinnedMenu = document.getElementById('pinnedNotesMenu');
    
    if (pinnedBtn) {
        pinnedBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Toggle dropdown
            const isOpen = pinnedMenu.style.display === 'block';
            if (isOpen) {
                pinnedMenu.style.display = 'none';
                pinnedDropdown.classList.remove('active');
            } else {
                pinnedMenu.style.display = 'block';
                pinnedDropdown.classList.add('active');
                loadPinnedNotesDropdown();
            }
        });
    }
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (pinnedDropdown && !pinnedDropdown.contains(e.target)) {
            pinnedMenu.style.display = 'none';
            pinnedDropdown.classList.remove('active');
        }
    });
    
    document.getElementById('trashBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        setActiveNavItem(e.currentTarget);
        // Load deleted notes
        loadNotesWithFilter('filter', 'trash');
    });
    
    // Event listeners are already set up in the main DOMContentLoaded
});

// Sign In / Sign Up Functions
let isSignUpMode = false;

function openSignInModal() {
    const modal = document.getElementById('signInModal');
    if (modal) {
        isSignUpMode = false;
        // Reset form and errors
        const authForm = document.getElementById('authForm');
        const errorDiv = document.getElementById('authError');
        if (authForm) {
            authForm.reset();
        }
        if (errorDiv) {
            errorDiv.style.display = 'none';
            errorDiv.textContent = '';
        }
        updateAuthModal();
        modal.classList.add('active');
        // Focus on email field
        setTimeout(() => {
            const emailInput = document.getElementById('authEmail');
            if (emailInput) {
                emailInput.focus();
            }
        }, 100);
    }
}

function closeSignInModal() {
    const modal = document.getElementById('signInModal');
    if (modal) {
        modal.classList.remove('active');
        // Reset form
        document.getElementById('authForm').reset();
        document.getElementById('authError').style.display = 'none';
        isSignUpMode = false;
        updateAuthModal();
    }
}

function updateAuthModal() {
    const title = document.getElementById('authModalTitle');
    const nameField = document.getElementById('nameField');
    const nameInput = document.getElementById('authName');
    const submitText = document.getElementById('authSubmitText');
    const switchText = document.getElementById('authSwitchText');
    const switchLink = document.getElementById('authSwitchLink');
    
    if (isSignUpMode) {
        title.textContent = 'Sign Up';
        nameField.style.display = 'block';
        if (nameInput) {
            nameInput.setAttribute('required', 'required');
        }
        submitText.textContent = 'Sign Up';
        switchText.textContent = 'Already have an account? ';
        switchLink.textContent = 'Sign In';
    } else {
        title.textContent = 'Sign In';
        nameField.style.display = 'none';
        if (nameInput) {
            nameInput.removeAttribute('required');
        }
        submitText.textContent = 'Sign In';
        switchText.textContent = "Don't have an account? ";
        switchLink.textContent = 'Sign Up';
    }
}

function toggleAuthMode() {
    isSignUpMode = !isSignUpMode;
    updateAuthModal();
    document.getElementById('authError').style.display = 'none';
}

// Helper function to create and show modal
function showInfoModal(title, content) {
    const modalId = title.toLowerCase().replace(/\s+/g, '') + 'Modal';
    let modal = document.getElementById(modalId);
    
    if (!modal) {
        modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'notes-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>${title}</h2>
                    <button class="modal-close" id="close${modalId}">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body" style="max-height: 70vh; overflow-y: auto;">
                    ${content}
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        document.getElementById(`close${modalId}`).addEventListener('click', () => {
            modal.classList.remove('active');
        });
        
        modal.addEventListener('click', (e) => {
            if (e.target.id === modalId) {
                modal.classList.remove('active');
            }
        });
    }
    
    modal.classList.add('active');
}

// About Modal
function showAboutModal() {
    const content = `
        <div style="text-align: center; padding: 2rem;">
            <div style="font-size: 3rem; color: var(--primary-color); margin-bottom: 1rem;">
                <i class="fas fa-sticky-note"></i>
            </div>
            <h2 style="margin-bottom: 0.5rem; color: var(--text-primary);">AnoNotepad</h2>
            <p style="color: var(--text-secondary); margin-bottom: 1.5rem;">Modern Online Notepad</p>
            <div style="text-align: left; max-width: 500px; margin: 0 auto;">
                <p style="color: var(--text-secondary); margin-bottom: 1rem;">
                    <strong>Version:</strong> 1.0.0
                </p>
                <p style="color: var(--text-secondary); margin-bottom: 1rem;">
                    A modern, feature-rich notepad application with organization tools, 
                    rich text editing, and cloud sync capabilities.
                </p>
                <p style="color: var(--text-secondary);">
                    <strong>Features:</strong> Notes, Folders, Pinned Notes, 
                    Export (PDF, DOCX, TXT), Search, and more.
                </p>
            </div>
        </div>
    `;
    showInfoModal('About', content);
}

// Terms of Use Modal
function showTermsModal() {
    const content = `
        <div style="padding: 1.5rem; line-height: 1.8; color: var(--text-primary);">
            <h3 style="margin-bottom: 1rem; color: var(--text-primary);">Terms of Use</h3>
            <p style="margin-bottom: 1rem; color: var(--text-secondary);">
                <strong>Last Updated:</strong> ${new Date().toLocaleDateString()}
            </p>
            <div style="color: var(--text-secondary);">
                <p style="margin-bottom: 1rem;">
                    <strong>1. Acceptance of Terms</strong><br>
                    By accessing and using AnoNotepad, you accept and agree to be bound by the terms and provision of this agreement.
                </p>
                <p style="margin-bottom: 1rem;">
                    <strong>2. Use License</strong><br>
                    Permission is granted to temporarily use AnoNotepad for personal, non-commercial use only. This is the grant of a license, not a transfer of title.
                </p>
                <p style="margin-bottom: 1rem;">
                    <strong>3. User Account</strong><br>
                    You are responsible for maintaining the confidentiality of your account and password. You agree to accept responsibility for all activities that occur under your account.
                </p>
                <p style="margin-bottom: 1rem;">
                    <strong>4. Content</strong><br>
                    You retain all rights to the content you create. By using this service, you grant us the right to store and process your content to provide the service.
                </p>
                <p style="margin-bottom: 1rem;">
                    <strong>5. Prohibited Uses</strong><br>
                    You may not use this service for any unlawful purpose or to solicit others to perform unlawful acts.
                </p>
            </div>
        </div>
    `;
    showInfoModal('Terms of Use', content);
}

// Privacy Policy Modal
function showPrivacyModal() {
    const content = `
        <div style="padding: 1.5rem; line-height: 1.8; color: var(--text-primary);">
            <h3 style="margin-bottom: 1rem; color: var(--text-primary);">Privacy Policy</h3>
            <p style="margin-bottom: 1rem; color: var(--text-secondary);">
                <strong>Last Updated:</strong> ${new Date().toLocaleDateString()}
            </p>
            <div style="color: var(--text-secondary);">
                <p style="margin-bottom: 1rem;">
                    <strong>1. Information We Collect</strong><br>
                    We collect information that you provide directly to us, including your name, email address, and any content you create using our service.
                </p>
                <p style="margin-bottom: 1rem;">
                    <strong>2. How We Use Your Information</strong><br>
                    We use the information we collect to provide, maintain, and improve our services, process transactions, and communicate with you.
                </p>
                <p style="margin-bottom: 1rem;">
                    <strong>3. Data Storage</strong><br>
                    Your notes and data are stored securely. We implement appropriate technical and organizational measures to protect your personal information.
                </p>
                <p style="margin-bottom: 1rem;">
                    <strong>4. Data Sharing</strong><br>
                    We do not sell, trade, or rent your personal information to third parties. We may share information only as described in this policy.
                </p>
                <p style="margin-bottom: 1rem;">
                    <strong>5. Your Rights</strong><br>
                    You have the right to access, update, or delete your personal information at any time through your account settings.
                </p>
                <p style="margin-bottom: 1rem;">
                    <strong>6. Cookies</strong><br>
                    We use cookies to enhance your experience, analyze site usage, and assist in our marketing efforts.
                </p>
            </div>
        </div>
    `;
    showInfoModal('Privacy Policy', content);
}

// Contact US Modal
function showContactModal() {
    const content = `
        <div style="padding: 1.5rem; line-height: 1.8; color: var(--text-primary);">
            <h3 style="margin-bottom: 1rem; color: var(--text-primary);">Contact Us</h3>
            <div style="color: var(--text-secondary);">
                <p style="margin-bottom: 1.5rem;">
                    We'd love to hear from you! If you have any questions, feedback, or need support, please reach out to us.
                </p>
                <div style="margin-bottom: 1.5rem;">
                    <p style="margin-bottom: 0.5rem;">
                        <strong><i class="fas fa-envelope"></i> Email:</strong><br>
                        <a href="mailto:anotespad@gmail.com" style="color: var(--primary-color); text-decoration: none;">anotespad@gmail.com</a>
                    </p>
                </div>
                <div style="margin-bottom: 1.5rem;">
                    <p style="margin-bottom: 0.5rem;">
                        <strong><i class="fas fa-globe"></i> Website:</strong><br>
                        <a href="https://anotepad.app" target="_blank" style="color: var(--primary-color); text-decoration: none;">www.anotepad.app</a>
                    </p>
                </div>
                <div style="margin-bottom: 1.5rem;">
                    <p style="margin-bottom: 0.5rem;">
                        <strong><i class="fas fa-clock"></i> Response Time:</strong><br>
                        We typically respond within 24-48 hours.
                    </p>
                </div>
                <div style="background: var(--bg-tertiary); padding: 1rem; border-radius: 8px; margin-top: 1.5rem;">
                    <p style="margin: 0; font-size: 0.9rem;">
                        <strong>Note:</strong> For technical support or feature requests, please include as much detail as possible to help us assist you better.
                    </p>
                </div>
            </div>
        </div>
    `;
    showInfoModal('Contact US', content);
}

async function handleAuthSubmit(e) {
    e.preventDefault();
    e.stopPropagation();
    
    const errorDiv = document.getElementById('authError');
    const emailInput = document.getElementById('authEmail');
    const passwordInput = document.getElementById('authPassword');
    
    if (!emailInput || !passwordInput) {
        console.error('Auth form inputs not found');
        return;
    }
    
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const name = isSignUpMode ? (document.getElementById('authName')?.value.trim() || '') : '';
    
    // Hide previous errors
    if (errorDiv) {
        errorDiv.style.display = 'none';
    }
    
    // Validate
    if (!email || !password) {
        showAuthError('Please fill in all fields');
        return;
    }
    
    if (isSignUpMode && !name) {
        showAuthError('Please enter your name');
        return;
    }
    
    // Create form data
    const formData = new FormData();
    formData.append('action', isSignUpMode ? 'signup' : 'signin');
    formData.append('email', email);
    formData.append('password', password);
    if (isSignUpMode) {
        formData.append('name', name);
    }
    
    // Disable submit button to prevent double submission
    const submitBtn = document.getElementById('authSubmitBtn');
    const submitText = document.getElementById('authSubmitText');
    const originalBtnText = submitText ? submitText.textContent : submitBtn.textContent;
    submitBtn.disabled = true;
    if (submitText) {
        submitText.textContent = 'Please wait...';
    } else {
        submitBtn.textContent = 'Please wait...';
    }
    
    try {
        const response = await fetch('auth.php', {
            method: 'POST',
            body: formData,
            credentials: 'include'
        });
        
        // Check if response is OK
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        // Try to parse JSON
        let result;
        try {
            const text = await response.text();
            if (!text.trim()) {
                throw new Error('Empty response from server');
            }
            result = JSON.parse(text);
        } catch (parseError) {
            console.error('JSON parse error:', parseError);
            showAuthError('Invalid response from server. Please try again.');
            submitBtn.disabled = false;
            if (submitText) {
                submitText.textContent = originalBtnText;
            } else {
                submitBtn.textContent = originalBtnText;
            }
            return;
        }
        
        if (result.success) {
            currentUserEmail = result.user.email;
            updateSignInUI(result.user);
            showNotification(isSignUpMode ? 'Account created successfully!' : 'Signed in successfully!', 'success');
            closeSignInModal();
            // Clear local storage notes when signing in (optional - you can keep them if you want)
            // localStorage.removeItem('anotepad_notes');
            // Reload notes and folders for the signed-in user
            setTimeout(() => {
                loadNotes();
                loadFolders();
            }, 500);
        } else {
            showAuthError(result.message || 'Authentication failed');
            submitBtn.disabled = false;
            if (submitText) {
                submitText.textContent = originalBtnText;
            } else {
                submitBtn.textContent = originalBtnText;
            }
        }
    } catch (error) {
        console.error('Auth error:', error);
        showAuthError('Error connecting to server. Please try again.');
        submitBtn.disabled = false;
        if (submitText) {
            submitText.textContent = originalBtnText;
        } else {
            submitBtn.textContent = originalBtnText;
        }
    }
}

function showAuthError(message) {
    const errorDiv = document.getElementById('authError');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

// Add animation styles
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    @keyframes slideInRight {
        from {
            transform: translateX(120%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(120%);
            opacity: 0;
        }
    }
    @keyframes float {
        0%, 100% {
            transform: translateY(0px);
        }
        50% {
            transform: translateY(-10px);
        }
    }
    .notification {
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
    }
    .notification i {
        font-size: 1.25rem;
    }
`;
document.head.appendChild(style);
