<?php
// Set headers for this file
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once 'config.php';

// Initialize database if needed
$initResult = initDatabase();
if ($initResult === false) {
    sendResponse(false, null, 'Failed to initialize database. Please check file permissions.');
}

$db = getDB();
if (!$db) {
    sendResponse(false, null, 'Database connection failed. Please check file permissions.');
}

// Check if user is signed in
if (!isset($_SESSION['user_id'])) {
    sendResponse(false, null, 'Please sign in to save notes');
}

$userId = $_SESSION['user_id'];

try {
    // Get input data
    $id = isset($_POST['id']) && $_POST['id'] !== '' && $_POST['id'] !== null ? intval($_POST['id']) : null;
    $title = isset($_POST['title']) ? trim($_POST['title']) : 'Untitled Note';
    $content = isset($_POST['content']) ? $_POST['content'] : '';
    $folderId = isset($_POST['folder_id']) && $_POST['folder_id'] !== '' ? intval($_POST['folder_id']) : null;
    $isPinned = isset($_POST['is_pinned']) ? intval($_POST['is_pinned']) : 0;
    
    // Validate input
    if (empty($title) && empty(strip_tags($content))) {
        sendResponse(false, null, 'Cannot save empty note');
    }
    
    // Ensure title is not empty
    if (empty($title)) {
        $title = 'Untitled Note';
    }
    
    // Generate preview
    $preview = generatePreview($content);
    
    if ($id) {
        // Verify note belongs to user
        $stmt = $db->prepare("SELECT content, user_id FROM notes WHERE id = ? AND is_deleted = 0");
        $stmt->execute([$id]);
        $currentNote = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$currentNote) {
            sendResponse(false, null, 'Note not found');
        }
        
        if ($currentNote['user_id'] != $userId) {
            sendResponse(false, null, 'You do not have permission to edit this note');
        }
        
        // Update existing note
        $stmt = $db->prepare("UPDATE notes SET title = ?, content = ?, preview = ?, folder_id = ?, is_pinned = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND is_deleted = 0");
        $stmt->execute([$title, $content, $preview, $folderId, $isPinned, $id, $userId]);
        
        if ($stmt->rowCount() > 0) {
            // Automatically create version if content changed significantly
            if ($currentNote && $currentNote['content'] !== $content) {
                // Check similarity - only create version if change is significant (more than 10% different)
                $similarity = similar_text($currentNote['content'], $content, $percent);
                if ($percent < 90) {
                    // Create version asynchronously (don't block the save)
                    // We'll create it in the background
                    try {
                        // Check version count and clean up if needed
                        $versionStmt = $db->prepare("SELECT COUNT(*) as count FROM note_versions WHERE note_id = ?");
                        $versionStmt->execute([$id]);
                        $versionCount = $versionStmt->fetch(PDO::FETCH_ASSOC);
                        
                        if ($versionCount && $versionCount['count'] >= 50) {
                            // Delete oldest 10 versions
                            if (DB_TYPE === 'sqlite') {
                                // SQLite doesn't support DELETE with subquery, so we need to get IDs first
                                $deleteStmt = $db->prepare("SELECT id FROM note_versions WHERE note_id = ? ORDER BY created_at ASC LIMIT 10");
                                $deleteStmt->execute([$id]);
                                $oldIds = $deleteStmt->fetchAll(PDO::FETCH_COLUMN);
                                if (!empty($oldIds)) {
                                    $placeholders = implode(',', array_fill(0, count($oldIds), '?'));
                                    $deleteStmt = $db->prepare("DELETE FROM note_versions WHERE id IN ($placeholders)");
                                    $deleteStmt->execute($oldIds);
                                }
                            } else {
                                // MySQL supports DELETE with subquery
                                $deleteStmt = $db->prepare("DELETE FROM note_versions WHERE note_id = ? AND id IN (
                                    SELECT id FROM (
                                        SELECT id FROM note_versions WHERE note_id = ? ORDER BY created_at ASC LIMIT 10
                                    ) AS temp
                                )");
                                $deleteStmt->execute([$id, $id]);
                            }
                        }
                        
                        // Insert new version
                        $versionStmt = $db->prepare("INSERT INTO note_versions (note_id, title, content) VALUES (?, ?, ?)");
                        $versionStmt->execute([$id, $title, $content]);
                    } catch (Exception $e) {
                        // Don't fail the save if version creation fails
                        error_log("Version creation error: " . $e->getMessage());
                    }
                }
            }
            
            sendResponse(true, ['id' => $id], 'Note updated successfully');
        } else {
            sendResponse(false, null, 'Note not found or no changes made');
        }
    } else {
        // Insert new note with user_id
        $stmt = $db->prepare("INSERT INTO notes (user_id, title, content, preview, folder_id, is_pinned) VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->execute([$userId, $title, $content, $preview, $folderId, $isPinned]);
        
        $newId = $db->lastInsertId();
        sendResponse(true, ['id' => $newId], 'Note saved successfully');
    }
} catch (PDOException $e) {
    error_log("Save error: " . $e->getMessage());
    sendResponse(false, null, 'Error saving note: ' . $e->getMessage());
} catch (Exception $e) {
    error_log("General error: " . $e->getMessage());
    sendResponse(false, null, 'Error: ' . $e->getMessage());
}
?>
