<?php
// Set headers for this file
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
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

try {
    $shareToken = isset($_POST['token']) ? trim($_POST['token']) : '';
    $noteId = isset($_POST['note_id']) ? intval($_POST['note_id']) : 0;
    $content = isset($_POST['content']) ? $_POST['content'] : '';
    
    if (empty($shareToken) || !$noteId) {
        sendResponse(false, null, 'Invalid parameters');
    }
    
    // Verify share link exists and has edit permission
    $stmt = $db->prepare("SELECT * FROM share_links WHERE share_token = ? AND note_id = ?");
    $stmt->execute([$shareToken, $noteId]);
    $shareLink = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$shareLink) {
        sendResponse(false, null, 'Share link not found');
    }
    
    if ($shareLink['permission'] !== 'edit') {
        sendResponse(false, null, 'This share link does not have edit permission');
    }
    
    // Check if expired
    if ($shareLink['expiry_date']) {
        $expiryTimestamp = strtotime($shareLink['expiry_date']);
        if ($expiryTimestamp < time()) {
            sendResponse(false, null, 'This share link has expired');
        }
    }
    
    // Update note content
    $stmt = $db->prepare("UPDATE notes SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND is_deleted = 0");
    $stmt->execute([$content, $noteId]);
    
    if ($stmt->rowCount() > 0) {
        sendResponse(true, null, 'Note updated successfully');
    } else {
        sendResponse(false, null, 'Note not found or no changes made');
    }
} catch (PDOException $e) {
    error_log("Save shared error: " . $e->getMessage());
    sendResponse(false, null, 'Error saving note: ' . $e->getMessage());
} catch (Exception $e) {
    error_log("General error: " . $e->getMessage());
    sendResponse(false, null, 'Error: ' . $e->getMessage());
}
?>
