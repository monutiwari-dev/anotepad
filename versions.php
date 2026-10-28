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
            sendResponse(false, null, 'Please sign in to save version history');
        }
        
        $userId = $_SESSION['user_id'];
        
        // Save a new version
        $noteId = isset($_POST['note_id']) ? intval($_POST['note_id']) : 0;
        $title = isset($_POST['title']) ? trim($_POST['title']) : '';
        $content = isset($_POST['content']) ? $_POST['content'] : '';
        
        if (!$noteId || empty($title)) {
            sendResponse(false, null, 'Invalid parameters');
        }
        
        // Verify note exists and belongs to user
        $stmt = $db->prepare("SELECT id FROM notes WHERE id = ? AND user_id = ? AND is_deleted = 0");
        $stmt->execute([$noteId, $userId]);
        if (!$stmt->fetch()) {
            sendResponse(false, null, 'Note not found or you do not have permission to save its version');
        }
        
        // Check if we should create a version (only if content changed significantly)
        // Get the last version
        $stmt = $db->prepare("SELECT content FROM note_versions WHERE note_id = ? ORDER BY created_at DESC LIMIT 1");
        $stmt->execute([$noteId]);
        $lastVersion = $stmt->fetch(PDO::FETCH_ASSOC);
        
        // Only create version if content changed significantly (more than 10% difference)
        $shouldCreateVersion = true;
        if ($lastVersion) {
            $oldContent = $lastVersion['content'];
            $similarity = similar_text($oldContent, $content, $percent);
            // Create version if change is significant (more than 10% different)
            if ($percent > 90) {
                $shouldCreateVersion = false;
            }
        }
        
        // Limit to 50 versions per note (delete oldest if exceeded)
        if ($shouldCreateVersion) {
            $stmt = $db->prepare("SELECT COUNT(*) as count FROM note_versions WHERE note_id = ?");
            $stmt->execute([$noteId]);
            $countResult = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if ($countResult && $countResult['count'] >= 50) {
                // Delete oldest 10 versions
                if (DB_TYPE === 'sqlite') {
                    // SQLite doesn't support DELETE with subquery, so we need to get IDs first
                    $stmt = $db->prepare("SELECT id FROM note_versions WHERE note_id = ? ORDER BY created_at ASC LIMIT 10");
                    $stmt->execute([$noteId]);
                    $oldIds = $stmt->fetchAll(PDO::FETCH_COLUMN);
                    if (!empty($oldIds)) {
                        $placeholders = implode(',', array_fill(0, count($oldIds), '?'));
                        $stmt = $db->prepare("DELETE FROM note_versions WHERE id IN ($placeholders)");
                        $stmt->execute($oldIds);
                    }
                } else {
                    // MySQL supports DELETE with subquery
                    $stmt = $db->prepare("DELETE FROM note_versions WHERE note_id = ? AND id IN (
                        SELECT id FROM (
                            SELECT id FROM note_versions WHERE note_id = ? ORDER BY created_at ASC LIMIT 10
                        ) AS temp
                    )");
                    $stmt->execute([$noteId, $noteId]);
                }
            }
            
            // Insert new version
            $stmt = $db->prepare("INSERT INTO note_versions (note_id, title, content) VALUES (?, ?, ?)");
            $stmt->execute([$noteId, $title, $content]);
            
            $versionId = $db->lastInsertId();
            sendResponse(true, ['version_id' => $versionId], 'Version saved successfully');
        } else {
            sendResponse(true, null, 'No significant changes detected');
        }
        
    } else if ($method === 'GET') {
        // Check if user is signed in
        if (!isset($_SESSION['user_id'])) {
            sendResponse(false, null, 'Please sign in to view version history');
        }
        
        $userId = $_SESSION['user_id'];
        
        // List versions for a note
        $noteId = isset($_GET['note_id']) ? intval($_GET['note_id']) : 0;
        
        if (!$noteId) {
            sendResponse(false, null, 'Invalid note ID');
        }
        
        // Verify note belongs to user
        $checkStmt = $db->prepare("SELECT id FROM notes WHERE id = ? AND user_id = ?");
        $checkStmt->execute([$noteId, $userId]);
        if (!$checkStmt->fetch()) {
            sendResponse(false, null, 'Note not found or you do not have permission to view its version history');
        }
        
        $stmt = $db->prepare("SELECT id, title, content, created_at FROM note_versions WHERE note_id = ? ORDER BY created_at DESC LIMIT 50");
        $stmt->execute([$noteId]);
        $versions = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Format dates and add preview
        foreach ($versions as &$version) {
            $version['preview'] = generatePreview($version['content'], 150);
            $version['formatted_date'] = date('M d, Y H:i', strtotime($version['created_at']));
            $version['relative_date'] = getRelativeTime($version['created_at']);
        }
        
        sendResponse(true, ['versions' => $versions], 'Versions retrieved successfully');
        
    } else if ($method === 'DELETE') {
        // Check if user is signed in
        if (!isset($_SESSION['user_id'])) {
            sendResponse(false, null, 'Please sign in to delete versions');
        }
        
        $userId = $_SESSION['user_id'];
        
        // Delete a specific version
        $versionId = isset($_GET['id']) ? intval($_GET['id']) : 0;
        
        if (!$versionId) {
            sendResponse(false, null, 'Invalid version ID');
        }
        
        // Verify version belongs to a note owned by the user
        $checkStmt = $db->prepare("SELECT nv.id FROM note_versions nv 
                                    INNER JOIN notes n ON nv.note_id = n.id 
                                    WHERE nv.id = ? AND n.user_id = ?");
        $checkStmt->execute([$versionId, $userId]);
        if (!$checkStmt->fetch()) {
            sendResponse(false, null, 'Version not found or you do not have permission to delete it');
        }
        
        $stmt = $db->prepare("DELETE FROM note_versions WHERE id = ?");
        $stmt->execute([$versionId]);
        
        if ($stmt->rowCount() > 0) {
            sendResponse(true, null, 'Version deleted successfully');
        } else {
            sendResponse(false, null, 'Version not found');
        }
    } else {
        sendResponse(false, null, 'Method not allowed');
    }
} catch (PDOException $e) {
    error_log("Versions error: " . $e->getMessage());
    sendResponse(false, null, 'Error: ' . $e->getMessage());
} catch (Exception $e) {
    error_log("General error: " . $e->getMessage());
    sendResponse(false, null, 'Error: ' . $e->getMessage());
}

// Helper function to get relative time
function getRelativeTime($datetime) {
    $timestamp = strtotime($datetime);
    $diff = time() - $timestamp;
    
    if ($diff < 60) {
        return 'Just now';
    } else if ($diff < 3600) {
        $minutes = floor($diff / 60);
        return $minutes . ' minute' . ($minutes > 1 ? 's' : '') . ' ago';
    } else if ($diff < 86400) {
        $hours = floor($diff / 3600);
        return $hours . ' hour' . ($hours > 1 ? 's' : '') . ' ago';
    } else if ($diff < 604800) {
        $days = floor($diff / 86400);
        return $days . ' day' . ($days > 1 ? 's' : '') . ' ago';
    } else if ($diff < 2592000) {
        $weeks = floor($diff / 604800);
        return $weeks . ' week' . ($weeks > 1 ? 's' : '') . ' ago';
    } else if ($diff < 31536000) {
        $months = floor($diff / 2592000);
        return $months . ' month' . ($months > 1 ? 's' : '') . ' ago';
    } else {
        $years = floor($diff / 31536000);
        return $years . ' year' . ($years > 1 ? 's' : '') . ' ago';
    }
}
?>
