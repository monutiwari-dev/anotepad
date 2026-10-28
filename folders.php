<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once 'config.php';

// Initialize database - this will create tables if they don't exist
$initResult = initDatabase();
if ($initResult === false) {
    // Try to get more details about the error
    $db = getDB();
    if (!$db) {
        sendResponse(false, null, 'Database connection failed. Please check file permissions.');
    } else {
        sendResponse(false, null, 'Failed to initialize database. Please check error logs.');
    }
}

$db = getDB();
if (!$db) {
    sendResponse(false, null, 'Database connection failed. Please check file permissions.');
}

// Check if user is signed in
if (!isset($_SESSION['user_id'])) {
    // Return empty folders list if not signed in
    error_log('folders.php: No user_id in session');
    sendResponse(true, ['folders' => []]);
}

$userId = $_SESSION['user_id'];
error_log('folders.php: User ID: ' . $userId . ', Method: ' . $_SERVER['REQUEST_METHOD']);

try {
    $method = $_SERVER['REQUEST_METHOD'];
    
    if ($method === 'GET') {
        // Get all folders for the current user
        $stmt = $db->prepare("SELECT id, name, parent_id, color FROM folders WHERE user_id = ? ORDER BY name");
        $stmt->execute([$userId]);
        $folders = $stmt->fetchAll(PDO::FETCH_ASSOC);
        error_log('folders.php GET: Found ' . count($folders) . ' folders for user ' . $userId);
        sendResponse(true, ['folders' => $folders]);
    } elseif ($method === 'POST') {
        $action = isset($_POST['action']) ? $_POST['action'] : 'create';
        
        if ($action === 'create') {
            $name = isset($_POST['name']) ? trim($_POST['name']) : '';
            $parentId = isset($_POST['parent_id']) && $_POST['parent_id'] !== '' ? intval($_POST['parent_id']) : null;
            $color = isset($_POST['color']) ? trim($_POST['color']) : null;
            
            if (empty($name)) {
                sendResponse(false, null, 'Folder name is required');
            }
            
            // Verify parent folder belongs to user if provided
            if ($parentId !== null) {
                $checkStmt = $db->prepare("SELECT id FROM folders WHERE id = ? AND user_id = ?");
                $checkStmt->execute([$parentId, $userId]);
                if (!$checkStmt->fetch()) {
                    sendResponse(false, null, 'Invalid parent folder');
                }
            }
            
            $stmt = $db->prepare("INSERT INTO folders (user_id, name, parent_id, color) VALUES (?, ?, ?, ?)");
            $stmt->execute([$userId, $name, $parentId, $color]);
            $newId = $db->lastInsertId();
            error_log('folders.php POST: Created folder ID ' . $newId . ' for user ' . $userId . ' with name: ' . $name);
            
            // Verify the folder was created by querying it back
            $verifyStmt = $db->prepare("SELECT id, name, parent_id, color FROM folders WHERE id = ? AND user_id = ?");
            $verifyStmt->execute([$newId, $userId]);
            $createdFolder = $verifyStmt->fetch(PDO::FETCH_ASSOC);
            error_log('folders.php POST: Verified folder exists: ' . ($createdFolder ? 'YES' : 'NO'));
            
            // Return the full folder object so it can be immediately added to the UI
            $folder = [
                'id' => $newId,
                'name' => $name,
                'parent_id' => $parentId,
                'color' => $color
            ];
            sendResponse(true, ['id' => $newId, 'folder' => $folder], 'Folder created');
        } elseif ($action === 'update') {
            $id = isset($_POST['id']) ? intval($_POST['id']) : 0;
            $name = isset($_POST['name']) ? trim($_POST['name']) : '';
            $color = isset($_POST['color']) ? trim($_POST['color']) : null;
            
            if (!$id || empty($name)) {
                sendResponse(false, null, 'Invalid folder data');
            }
            
            // Verify folder belongs to user
            $checkStmt = $db->prepare("SELECT id FROM folders WHERE id = ? AND user_id = ?");
            $checkStmt->execute([$id, $userId]);
            if (!$checkStmt->fetch()) {
                sendResponse(false, null, 'Folder not found or you do not have permission to update it');
            }
            
            $stmt = $db->prepare("UPDATE folders SET name = ?, color = ? WHERE id = ? AND user_id = ?");
            $stmt->execute([$name, $color, $id, $userId]);
            sendResponse(true, null, 'Folder updated');
        } elseif ($action === 'delete') {
            $id = isset($_POST['id']) ? intval($_POST['id']) : 0;
            $moveNotes = isset($_POST['move_notes']) ? intval($_POST['move_notes']) : 1; // Default: move notes
            
            if (!$id) {
                sendResponse(false, null, 'Invalid folder ID');
            }
            
            // Verify folder belongs to user
            $checkStmt = $db->prepare("SELECT id FROM folders WHERE id = ? AND user_id = ?");
            $checkStmt->execute([$id, $userId]);
            if (!$checkStmt->fetch()) {
                sendResponse(false, null, 'Folder not found or you do not have permission to delete it');
            }
            
            // Check if folder has notes (only user's notes)
            $checkStmt = $db->prepare("SELECT COUNT(*) FROM notes WHERE folder_id = ? AND user_id = ? AND is_deleted = 0");
            $checkStmt->execute([$id, $userId]);
            $noteCount = $checkStmt->fetchColumn();
            
            // Start transaction
            $db->beginTransaction();
            
            try {
                // If folder has notes, move them to "No Folder" (folder_id = NULL)
                if ($noteCount > 0 && $moveNotes) {
                    $moveStmt = $db->prepare("UPDATE notes SET folder_id = NULL WHERE folder_id = ? AND user_id = ? AND is_deleted = 0");
                    $moveStmt->execute([$id, $userId]);
                    $movedCount = $moveStmt->rowCount();
                } else {
                    $movedCount = 0;
                }
                
                // Delete the folder (only if it belongs to user)
                $stmt = $db->prepare("DELETE FROM folders WHERE id = ? AND user_id = ?");
                $stmt->execute([$id, $userId]);
                
                // Commit transaction
                $db->commit();
                
                if ($movedCount > 0) {
                    sendResponse(true, ['moved_notes' => $movedCount], "Folder deleted. {$movedCount} note(s) moved to 'No Folder'.");
                } else {
                    sendResponse(true, null, 'Folder deleted');
                }
            } catch (PDOException $e) {
                // Rollback on error
                $db->rollBack();
                throw $e;
            }
        }
    }
} catch (PDOException $e) {
    $errorMsg = "Folder error: " . $e->getMessage();
    error_log($errorMsg);
    // Log to file for debugging
    @file_put_contents(__DIR__ . '/db_error.log', date('Y-m-d H:i:s') . " - " . $errorMsg . "\n", FILE_APPEND);
    
    // Provide user-friendly error message
    $userMsg = 'Error processing folder request';
    if (strpos($e->getMessage(), 'no such table') !== false) {
        $userMsg = 'Database tables not initialized. Please refresh the page.';
    } elseif (strpos($e->getMessage(), 'UNIQUE constraint') !== false) {
        $userMsg = 'A folder with this name already exists.';
    }
    
    sendResponse(false, null, $userMsg);
} catch (Exception $e) {
    $errorMsg = "General error: " . $e->getMessage();
    error_log($errorMsg);
    @file_put_contents(__DIR__ . '/db_error.log', date('Y-m-d H:i:s') . " - " . $errorMsg . "\n", FILE_APPEND);
    sendResponse(false, null, 'An error occurred. Please try again.');
}
?>
