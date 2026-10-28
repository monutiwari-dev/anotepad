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
if (!initDatabase()) {
    sendResponse(false, null, 'Failed to initialize database');
}

$db = getDB();
if (!$db) {
    sendResponse(false, null, 'Database connection failed');
}

// Check if user is signed in
if (!isset($_SESSION['user_id'])) {
    sendResponse(false, null, 'Please sign in to delete notes');
}

$userId = $_SESSION['user_id'];

try {
    $id = isset($_POST['id']) ? intval($_POST['id']) : 0;
    $permanent = isset($_POST['permanent']) ? intval($_POST['permanent']) : 0;
    
    if (!$id) {
        sendResponse(false, null, 'Invalid note ID');
    }
    
    // Verify note belongs to user
    $checkStmt = $db->prepare("SELECT id FROM notes WHERE id = ? AND user_id = ?");
    $checkStmt->execute([$id, $userId]);
    if (!$checkStmt->fetch()) {
        sendResponse(false, null, 'Note not found or you do not have permission to delete it');
    }
    
    if ($permanent) {
        // Permanent delete - only delete if it belongs to the user
        $stmt = $db->prepare("DELETE FROM notes WHERE id = ? AND user_id = ?");
        $stmt->execute([$id, $userId]);
        $message = 'Note permanently deleted';
    } else {
        // Soft delete (move to trash) - only update if it belongs to the user
        // Try to use is_deleted and is_pinned columns (they should exist after initDatabase)
        // If they don't exist, the query will fail and we'll catch it
        try {
            $stmt = $db->prepare("UPDATE notes SET is_deleted = 1, is_pinned = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?");
            $stmt->execute([$id, $userId]);
            $message = 'Note moved to trash';
        } catch (PDOException $e) {
            // If columns don't exist, try without is_pinned
            if (strpos($e->getMessage(), 'no such column') !== false || strpos($e->getMessage(), "Unknown column") !== false) {
                try {
                    $stmt = $db->prepare("UPDATE notes SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?");
                    $stmt->execute([$id, $userId]);
                    $message = 'Note moved to trash';
                } catch (PDOException $e2) {
                    // If is_deleted also doesn't exist, do permanent delete
                    $stmt = $db->prepare("DELETE FROM notes WHERE id = ? AND user_id = ?");
                    $stmt->execute([$id, $userId]);
                    $message = 'Note deleted';
                }
            } else {
                throw $e;
            }
        }
    }
    
    if ($stmt->rowCount() > 0) {
        sendResponse(true, null, $message);
    } else {
        sendResponse(false, null, 'Note not found');
    }
} catch (PDOException $e) {
    error_log("Delete error: " . $e->getMessage());
    sendResponse(false, null, 'Error deleting note: ' . $e->getMessage());
}
?>
