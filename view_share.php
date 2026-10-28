<?php
require_once 'config.php';

// Initialize database if needed
$initResult = initDatabase();
if ($initResult === false) {
    die('Failed to initialize database. Please check file permissions.');
}

$db = getDB();
if (!$db) {
    die('Database connection failed. Please check file permissions.');
}

// Get share token from URL
$shareToken = isset($_GET['token']) ? trim($_GET['token']) : '';

if (empty($shareToken)) {
    die('Invalid share link');
}

try {
    // Get share link details
    $stmt = $db->prepare("SELECT * FROM share_links WHERE share_token = ?");
    $stmt->execute([$shareToken]);
    $shareLink = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$shareLink) {
        die('Share link not found or has been deleted');
    }
    
    // Check if expired
    if ($shareLink['expiry_date']) {
        $expiryTimestamp = strtotime($shareLink['expiry_date']);
        if ($expiryTimestamp < time()) {
            die('This share link has expired');
        }
    }
    
    // Check password if required
    $passwordRequired = !empty($shareLink['password_hash']);
    $passwordValid = false;
    
    if ($passwordRequired) {
        if (isset($_POST['password'])) {
            if (password_verify($_POST['password'], $shareLink['password_hash'])) {
                $passwordValid = true;
            } else {
                $error = 'Incorrect password';
            }
        }
    } else {
        $passwordValid = true;
    }
    
    // Initialize variables
    $note = null;
    $isEditable = false;
    
    // If password is valid, get the note
    if ($passwordValid) {
        // Update access count
        $stmt = $db->prepare("UPDATE share_links SET access_count = access_count + 1 WHERE id = ?");
        $stmt->execute([$shareLink['id']]);
        
        // Get note
        $stmt = $db->prepare("SELECT * FROM notes WHERE id = ? AND is_deleted = 0");
        $stmt->execute([$shareLink['note_id']]);
        $note = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$note) {
            die('Note not found or has been deleted');
        }
        
        $isEditable = $shareLink['permission'] === 'edit';
    }
} catch (PDOException $e) {
    error_log("View share error: " . $e->getMessage());
    die('Error loading shared note');
}

// Get the note content - it's stored as HTML from the editor's innerHTML
// No need to decode - it's already HTML, just output it directly
$noteContent = $note ? $note['content'] : '';
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo htmlspecialchars($note['title'] ?? 'Shared Note'); ?> - AnoNotepad</title>
    <link rel="stylesheet" href="style.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        body {
            overflow: auto !important;
            overflow-x: hidden;
            height: auto;
        }
        html {
            overflow: auto !important;
            overflow-x: hidden;
            height: auto;
        }
        .shared-page-container {
            min-height: 100vh;
            background: var(--bg-secondary);
            padding: 2rem 1rem;
        }
        .shared-note-wrapper {
            max-width: 900px;
            margin: 0 auto;
            background: var(--bg-primary);
            border-radius: 12px;
            box-shadow: var(--shadow-md);
            overflow: hidden;
        }
        .shared-note-header {
            padding: 1.5rem 2rem;
            border-bottom: 1px solid var(--border-color);
            background: var(--bg-primary);
        }
        .shared-note-title {
            font-size: 1.5rem;
            font-weight: 600;
            margin-bottom: 0.5rem;
            color: var(--text-primary);
        }
        .shared-note-meta {
            color: var(--text-secondary);
            font-size: 0.875rem;
            display: flex;
            align-items: center;
            gap: 1rem;
        }
        .shared-note-meta i {
            margin-right: 0.25rem;
        }
        .shared-editor-wrapper {
            padding: 2rem;
            padding-bottom: 5rem;
            background: var(--bg-primary);
            min-height: 400px;
        }
        .shared-note-editor {
            width: 100%;
            min-height: 100%;
            font-size: 1rem;
            line-height: 1.8;
            color: var(--text-primary);
            outline: none;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        }
        .shared-note-editor[contenteditable="false"] {
            cursor: default;
            user-select: text;
        }
        .shared-note-editor[contenteditable="true"] {
            cursor: text;
        }
        .shared-note-editor[contenteditable="true"]:focus {
            outline: none;
        }
        /* Match editor styles exactly */
        .shared-note-editor p {
            margin-bottom: 1rem;
        }
        .shared-note-editor h1, .shared-note-editor h2, .shared-note-editor h3 {
            margin-top: 1.5rem;
            margin-bottom: 1rem;
            font-weight: 600;
        }
        .shared-note-editor h1 {
            font-size: 2rem;
        }
        .shared-note-editor h2 {
            font-size: 1.5rem;
        }
        .shared-note-editor h3 {
            font-size: 1.25rem;
        }
        .shared-note-editor ul, .shared-note-editor ol {
            margin-left: 2rem;
            margin-bottom: 1rem;
        }
        .shared-note-editor a {
            color: var(--primary-color);
            text-decoration: underline;
        }
        .shared-note-editor code {
            background: var(--bg-tertiary);
            padding: 0.125rem 0.375rem;
            border-radius: 3px;
            font-family: 'Courier New', monospace;
            font-size: 0.9em;
        }
        .shared-note-editor pre {
            background: var(--bg-tertiary);
            padding: 1rem;
            border-radius: 6px;
            overflow-x: auto;
            margin-bottom: 1rem;
        }
        .shared-note-editor pre code {
            background: transparent;
            padding: 0;
        }
        .shared-note-editor table {
            width: 100%;
            border-collapse: collapse;
            margin: 1rem 0;
            border: 1px solid var(--border-color);
        }
        .shared-note-editor table td,
        .shared-note-editor table th {
            border: 1px solid var(--border-color);
            padding: 0.5rem;
            text-align: left;
        }
        .shared-note-editor table th {
            background: var(--bg-tertiary);
            font-weight: 600;
        }
        .shared-note-actions {
            padding: 1rem 2rem;
            border-top: 1px solid var(--border-color);
            background: var(--bg-primary);
            display: flex;
            justify-content: flex-end;
            gap: 1rem;
        }
        .btn-save {
            padding: 0.75rem 1.5rem;
            background: var(--primary-color);
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 0.9375rem;
            font-weight: 500;
            cursor: pointer;
            transition: background-color 0.2s;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        .btn-save:hover {
            background: var(--primary-dark);
        }
        .save-indicator {
            position: fixed;
            bottom: 2rem;
            right: 2rem;
            padding: 0.75rem 1.5rem;
            background: var(--primary-color);
            color: white;
            border-radius: 6px;
            box-shadow: var(--shadow-md);
            display: none;
            z-index: 1000;
            align-items: center;
            gap: 0.5rem;
        }
        .save-indicator.show {
            display: flex;
        }
        .password-form {
            max-width: 400px;
            margin: 4rem auto;
            padding: 2rem;
            background: var(--bg-primary);
            border-radius: 8px;
            box-shadow: var(--shadow-md);
        }
        .password-form h2 {
            margin-bottom: 1rem;
            color: var(--text-primary);
        }
        .password-form input {
            width: 100%;
            padding: 0.75rem;
            margin-bottom: 1rem;
            border: 1px solid var(--border-color);
            border-radius: 4px;
            font-size: 1rem;
            background: var(--bg-primary);
            color: var(--text-primary);
        }
        .password-form button {
            width: 100%;
            padding: 0.75rem;
            background: var(--primary-color);
            color: white;
            border: none;
            border-radius: 4px;
            font-size: 1rem;
            cursor: pointer;
        }
        .password-form button:hover {
            background: var(--primary-dark);
        }
        .error-message {
            color: var(--danger);
            margin-bottom: 1rem;
            padding: 0.5rem;
            background: rgba(220, 53, 69, 0.1);
            border-radius: 4px;
        }
        @media (max-width: 768px) {
            .shared-page-container {
                padding: 1rem 0.5rem;
            }
            .shared-note-header {
                padding: 1rem;
            }
            .shared-editor-wrapper {
                padding: 1rem;
            }
        }
    </style>
</head>
<body>
    <?php if (!$passwordValid): ?>
        <div class="password-form">
            <h2><i class="fas fa-lock"></i> Password Required</h2>
            <p style="color: var(--text-secondary); margin-bottom: 1.5rem;">This shared note is password protected.</p>
            <?php if (isset($error)): ?>
                <div class="error-message"><?php echo htmlspecialchars($error); ?></div>
            <?php endif; ?>
            <form method="POST">
                <input type="password" name="password" placeholder="Enter password" required autofocus>
                <button type="submit">Access Note</button>
            </form>
        </div>
    <?php else: ?>
        <?php if ($note): ?>
        <div class="shared-page-container">
            <div class="shared-note-wrapper">
                <div class="shared-note-header">
                    <div class="shared-note-title"><?php echo htmlspecialchars($note['title']); ?></div>
                    <div class="shared-note-meta">
                        <span>
                            <i class="fas fa-<?php echo $isEditable ? 'edit' : 'eye'; ?>"></i>
                            <?php echo $isEditable ? 'Editable' : 'Read-only'; ?>
                        </span>
                        <?php if ($shareLink['expiry_date']): ?>
                            <span>
                                <i class="fas fa-clock"></i>
                                Expires: <?php echo date('M d, Y H:i', strtotime($shareLink['expiry_date'])); ?>
                            </span>
                        <?php endif; ?>
                    </div>
                </div>
                
                <div class="shared-editor-wrapper">
                    <div class="shared-note-editor" 
                         id="sharedNoteEditor" 
                         contenteditable="<?php echo $isEditable ? 'true' : 'false'; ?>"
                         spellcheck="true"></div>
                </div>
                <!-- Store content in a script tag to avoid any PHP escaping -->
                <script type="application/json" id="noteContentData"><?php echo json_encode($noteContent, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT); ?></script>
                
                <?php if ($isEditable): ?>
                    <div class="shared-note-actions">
                        <button class="btn-save" id="saveSharedNote">
                            <i class="fas fa-save"></i>
                            <span>Save Changes</span>
                        </button>
                    </div>
                <?php endif; ?>
            </div>
        </div>
        
        <div class="save-indicator" id="saveIndicator">
            <i class="fas fa-check"></i>
            <span>Changes saved</span>
        </div>
        <?php endif; ?>
    <?php endif; ?>
    
    <script>
        // Load and render content as HTML immediately
        (function() {
            const editor = document.getElementById('sharedNoteEditor');
            const contentScript = document.getElementById('noteContentData');
            
            if (editor && contentScript) {
                try {
                    // Parse the JSON content
                    const content = JSON.parse(contentScript.textContent);
                    // Set as innerHTML to render as HTML
                    editor.innerHTML = content;
                } catch (e) {
                    // Fallback: use textContent and decode HTML entities
                    const rawContent = contentScript.textContent;
                    const tempDiv = document.createElement('div');
                    tempDiv.textContent = rawContent;
                    editor.innerHTML = tempDiv.innerHTML || rawContent;
                }
            }
        })();
    </script>
    
    <?php if ($passwordValid && $isEditable && $note): ?>
    <script>
        const shareToken = '<?php echo htmlspecialchars($shareToken, ENT_QUOTES, 'UTF-8'); ?>';
        const noteId = <?php echo intval($note['id']); ?>;
        const editor = document.getElementById('sharedNoteEditor');
        const saveBtn = document.getElementById('saveSharedNote');
        const saveIndicator = document.getElementById('saveIndicator');
        let saveTimeout = null;
        
        // Auto-save on content change (debounced)
        editor.addEventListener('input', () => {
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(() => {
                saveSharedNote();
            }, 2000);
        });
        
        // Manual save button
        saveBtn.addEventListener('click', () => {
            saveSharedNote();
        });
        
        function saveSharedNote() {
            const content = editor.innerHTML;
            
            fetch('save_shared.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: `token=${encodeURIComponent(shareToken)}&note_id=${noteId}&content=${encodeURIComponent(content)}`
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    saveIndicator.classList.add('show');
                    setTimeout(() => {
                        saveIndicator.classList.remove('show');
                    }, 2000);
                } else {
                    alert('Error saving: ' + (data.message || 'Unknown error'));
                }
            })
            .catch(error => {
                console.error('Error:', error);
                alert('Error saving note. Please try again.');
            });
        }
        
        // Prevent editing if read-only (extra safety)
        <?php if (!$isEditable): ?>
        editor.addEventListener('keydown', (e) => {
            e.preventDefault();
            return false;
        });
        editor.addEventListener('paste', (e) => {
            e.preventDefault();
            return false;
        });
        <?php endif; ?>
    </script>
    <?php endif; ?>
</body>
</html>
