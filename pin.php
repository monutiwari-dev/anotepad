<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once 'config.php';

if (!initDatabase()) {
    sendResponse(false, null, 'Failed to initialize database');
}

$db = getDB();
if (!$db) {
    sendResponse(false, null, 'Database connection failed');
}

// Check if user is signed in
if (!isset($_SESSION['user_id'])) {
    sendResponse(false, null, 'Please sign in to pin notes');
}

$userId = $_SESSION['user_id'];

try {
    $id = isset($_POST['id']) ? intval($_POST['id']) : 0;
    $pin = isset($_POST['pin']) ? intval($_POST['pin']) : 1;
    
    if (!$id) {
        sendResponse(false, null, 'Invalid note ID');
    }
    
    // Verify note belongs to user
    $checkStmt = $db->prepare("SELECT id FROM notes WHERE id = ? AND user_id = ?");
    $checkStmt->execute([$id, $userId]);
    if (!$checkStmt->fetch()) {
        sendResponse(false, null, 'Note not found or you do not have permission to pin it');
    }
    
    $stmt = $db->prepare("UPDATE notes SET is_pinned = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND is_deleted = 0");
    $stmt->execute([$pin, $id, $userId]);
    
    if ($stmt->rowCount() > 0) {
        $message = $pin ? 'Note pinned' : 'Note unpinned';
        sendResponse(true, null, $message);
    } else {
        sendResponse(false, null, 'Note not found');
    }
} catch (PDOException $e) {
    error_log("Pin error: " . $e->getMessage());
    sendResponse(false, null, 'Error: ' . $e->getMessage());
}
?>
