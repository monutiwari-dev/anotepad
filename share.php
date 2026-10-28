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

try {
    $method = $_SERVER['REQUEST_METHOD'];
    
    if ($method === 'POST') {
        // Check if user is signed in
        if (!isset($_SESSION['user_id'])) {
            sendResponse(false, null, 'Please sign in to share notes');
        }
        
        $userId = $_SESSION['user_id'];
        
        // Create a new share link
        $noteId = isset($_POST['note_id']) ? intval($_POST['note_id']) : 0;
        $permission = isset($_POST['permission']) && in_array($_POST['permission'], ['read', 'edit']) ? $_POST['permission'] : 'read';
        $password = isset($_POST['password']) ? trim($_POST['password']) : '';
        $expiryDate = isset($_POST['expiry_date']) && !empty($_POST['expiry_date']) ? $_POST['expiry_date'] : null;
        
        if (!$noteId) {
            sendResponse(false, null, 'Invalid note ID');
        }
        
        // Verify note exists, belongs to user, and is not deleted
        $stmt = $db->prepare("SELECT id FROM notes WHERE id = ? AND user_id = ? AND is_deleted = 0");
        $stmt->execute([$noteId, $userId]);
        if (!$stmt->fetch()) {
            sendResponse(false, null, 'Note not found or you do not have permission to share it');
        }
        
        // Generate unique share token
        $shareToken = bin2hex(random_bytes(32));
        
        // Hash password if provided
        $passwordHash = !empty($password) ? password_hash($password, PASSWORD_DEFAULT) : null;
        
        // Validate expiry date format
        if ($expiryDate) {
            $expiryTimestamp = strtotime($expiryDate);
            if ($expiryTimestamp === false || $expiryTimestamp < time()) {
                sendResponse(false, null, 'Invalid expiry date');
            }
            $expiryDate = date('Y-m-d H:i:s', $expiryTimestamp);
        }
        
        // Insert share link
        $stmt = $db->prepare("INSERT INTO share_links (share_token, note_id, permission, password_hash, expiry_date) VALUES (?, ?, ?, ?, ?)");
        $stmt->execute([$shareToken, $noteId, $permission, $passwordHash, $expiryDate]);
        
        $shareId = $db->lastInsertId();
        
        // Generate share URL
        $shareUrl = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http') . 
                    '://' . $_SERVER['HTTP_HOST'] . 
                    dirname($_SERVER['PHP_SELF']) . 
                    '/view_share.php?token=' . $shareToken;
        
        sendResponse(true, [
            'share_id' => $shareId,
            'share_token' => $shareToken,
            'share_url' => $shareUrl,
            'permission' => $permission,
            'expiry_date' => $expiryDate
        ], 'Share link created successfully');
        
    } else if ($method === 'GET') {
        // Check if user is signed in
        if (!isset($_SESSION['user_id'])) {
            sendResponse(false, null, 'Please sign in to view share links');
        }
        
        $userId = $_SESSION['user_id'];
        
        // List share links for a note
        $noteId = isset($_GET['note_id']) ? intval($_GET['note_id']) : 0;
        
        if (!$noteId) {
            sendResponse(false, null, 'Invalid note ID');
        }
        
        // Verify note belongs to user
        $checkStmt = $db->prepare("SELECT id FROM notes WHERE id = ? AND user_id = ?");
        $checkStmt->execute([$noteId, $userId]);
        if (!$checkStmt->fetch()) {
            sendResponse(false, null, 'Note not found or you do not have permission to view its share links');
        }
        
        $stmt = $db->prepare("SELECT id, share_token, permission, expiry_date, access_count, created_at FROM share_links WHERE note_id = ? ORDER BY created_at DESC");
        $stmt->execute([$noteId]);
        $shares = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Generate share URLs for each
        foreach ($shares as &$share) {
            $share['share_url'] = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http') . 
                                  '://' . $_SERVER['HTTP_HOST'] . 
                                  dirname($_SERVER['PHP_SELF']) . 
                                  '/view_share.php?token=' . $share['share_token'];
            $share['has_password'] = !empty($share['password_hash']);
            unset($share['password_hash']);
        }
        
        sendResponse(true, ['shares' => $shares], 'Share links retrieved successfully');
        
    } else if ($method === 'DELETE') {
        // Check if user is signed in
        if (!isset($_SESSION['user_id'])) {
            sendResponse(false, null, 'Please sign in to delete share links');
        }
        
        $userId = $_SESSION['user_id'];
        
        // Delete a share link
        $shareId = isset($_GET['id']) ? intval($_GET['id']) : 0;
        
        if (!$shareId) {
            sendResponse(false, null, 'Invalid share ID');
        }
        
        // Verify share link belongs to a note owned by the user
        $checkStmt = $db->prepare("SELECT sl.id FROM share_links sl 
                                    INNER JOIN notes n ON sl.note_id = n.id 
                                    WHERE sl.id = ? AND n.user_id = ?");
        $checkStmt->execute([$shareId, $userId]);
        if (!$checkStmt->fetch()) {
            sendResponse(false, null, 'Share link not found or you do not have permission to delete it');
        }
        
        $stmt = $db->prepare("DELETE FROM share_links WHERE id = ?");
        $stmt->execute([$shareId]);
        
        if ($stmt->rowCount() > 0) {
            sendResponse(true, null, 'Share link deleted successfully');
        } else {
            sendResponse(false, null, 'Share link not found');
        }
    } else {
        sendResponse(false, null, 'Method not allowed');
    }
} catch (PDOException $e) {
    error_log("Share error: " . $e->getMessage());
    sendResponse(false, null, 'Error: ' . $e->getMessage());
} catch (Exception $e) {
    error_log("General error: " . $e->getMessage());
    sendResponse(false, null, 'Error: ' . $e->getMessage());
}
?>
