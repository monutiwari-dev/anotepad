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
    // Return empty notes list if not signed in
    sendResponse(true, ['notes' => [], 'folders' => []]);
}

$userId = $_SESSION['user_id'];

try {
    $action = isset($_GET['action']) ? $_GET['action'] : 'list';
    
    if ($action === 'single') {
        // Load single note
        $id = isset($_GET['id']) ? intval($_GET['id']) : 0;
        
        if (!$id) {
            sendResponse(false, null, 'Invalid note ID');
        }
        
        $stmt = $db->prepare("SELECT * FROM notes WHERE id = ? AND user_id = ?");
        $stmt->execute([$id, $userId]);
        $note = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if ($note) {
            // Include all fields including new ones (with defaults if columns don't exist)
            $note['folder_id'] = $note['folder_id'] ?? null;
            $note['is_pinned'] = isset($note['is_pinned']) ? intval($note['is_pinned']) : 0;
            $note['is_archived'] = isset($note['is_archived']) ? intval($note['is_archived']) : 0;
            $note['is_deleted'] = isset($note['is_deleted']) ? intval($note['is_deleted']) : 0;
            sendResponse(true, ['note' => $note]);
        } else {
            sendResponse(false, null, 'Note not found');
        }
    } else {
        // Load all notes for the current user (exclude deleted)
        $filter = isset($_GET['filter']) ? $_GET['filter'] : 'all';
        $folderId = isset($_GET['folder_id']) ? intval($_GET['folder_id']) : null;
        
        // Build query - columns should exist after initDatabase, but we'll try to handle gracefully
        $query = "SELECT id, title, preview, folder_id, is_pinned, is_archived, created_at, updated_at FROM notes WHERE user_id = ? AND is_deleted = 0";
        
        if ($filter === 'pinned') {
            $query .= " AND is_pinned = 1";
        } elseif ($filter === 'trash') {
            $query = "SELECT id, title, preview, folder_id, is_pinned, is_archived, created_at, updated_at FROM notes WHERE user_id = ? AND is_deleted = 1";
        } elseif ($filter === 'recent') {
            $query .= " AND is_deleted = 0";
            // Recent notes: last 7 days
            if (DB_TYPE === 'sqlite') {
                $query .= " AND updated_at >= datetime('now', '-7 days')";
            } else {
                $query .= " AND updated_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)";
            }
        } elseif ($filter === 'favorites') {
            // For now, favorites will show pinned notes
            // You can add a favorites column later if needed
            $query .= " AND is_pinned = 1 AND is_deleted = 0";
        } else {
            $query .= " AND is_deleted = 0";
        }
        
        // Build query with parameters for security
        $params = [$userId];
        
        if ($folderId !== null) {
            $query .= " AND folder_id = ?";
            $params[] = intval($folderId);
        }
        
        if ($filter === 'recent') {
            $query .= " ORDER BY updated_at DESC";
        } else {
            $query .= " ORDER BY is_pinned DESC, updated_at DESC";
        }
        
        // Use prepared statement for security
        $stmt = $db->prepare($query);
        $stmt->execute($params);
        $notes = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Also load folders for the current user
        $foldersStmt = $db->prepare("SELECT id, name, parent_id, color FROM folders WHERE user_id = ? ORDER BY name");
        $foldersStmt->execute([$userId]);
        $folders = $foldersStmt->fetchAll(PDO::FETCH_ASSOC);
        
        sendResponse(true, ['notes' => $notes, 'folders' => $folders]);
    }
} catch (PDOException $e) {
    error_log("Load error: " . $e->getMessage());
    sendResponse(false, null, 'Error loading notes: ' . $e->getMessage());
}
?>
