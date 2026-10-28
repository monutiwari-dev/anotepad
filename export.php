<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once 'config.php';

if (!initDatabase()) {
    http_response_code(500);
    die('Failed to initialize database');
}

$db = getDB();
if (!$db) {
    http_response_code(500);
    die('Database connection failed');
}

try {
    $id = isset($_GET['id']) ? intval($_GET['id']) : 0;
    $format = isset($_GET['format']) ? strtolower(trim($_GET['format'])) : 'pdf';
    
    if (!$id) {
        http_response_code(400);
        die('Invalid note ID');
    }
    
    if (!in_array($format, ['pdf', 'docx', 'txt'])) {
        http_response_code(400);
        die('Invalid format');
    }
    
    // Check if user is signed in
    if (!isset($_SESSION['user_id'])) {
        http_response_code(401);
        die('Please sign in to export notes');
    }
    
    $userId = $_SESSION['user_id'];
    
    // Verify note belongs to user
    $stmt = $db->prepare("SELECT title, content FROM notes WHERE id = ? AND user_id = ? AND is_deleted = 0");
    $stmt->execute([$id, $userId]);
    $note = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$note) {
        http_response_code(404);
        die('Note not found or you do not have permission to export it');
    }
    
    $title = $note['title'];
    $content = $note['content'];
    
    // Sanitize filename
    $filename = preg_replace('/[^a-zA-Z0-9_-]/', '_', $title);
    if (empty($filename)) {
        $filename = 'note_' . $id;
    }
    
    switch ($format) {
        case 'pdf':
            // Return HTML for PDF (uses browser print dialog)
            header('Content-Type: application/json');
            $html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' . htmlspecialchars($title) . '</title>';
            $html .= '<style>
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
            </style></head><body>';
            $html .= '<h1>' . htmlspecialchars($title) . '</h1>';
            $html .= '<div>' . $content . '</div>';
            $html .= '</body></html>';
            
            echo json_encode([
                'success' => true,
                'html' => $html,
                'title' => $title
            ]);
            break;
            
        case 'docx':
            // Generate DOCX using HTML that Word can open
            // Note: This creates an HTML file with .docx extension that Word can open
            header('Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document');
            header('Content-Disposition: attachment; filename="' . $filename . '.docx"');
            
            // Create a simple HTML document that Word can open
            echo '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
            echo '<!DOCTYPE html>';
            echo '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">';
            echo '<head><meta charset="UTF-8">';
            echo '<title>' . htmlspecialchars($title) . '</title>';
            echo '<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->';
            echo '<style>
                body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
                h1 { color: #333; border-bottom: 2px solid #6366f1; padding-bottom: 10px; }
                p { margin: 1em 0; }
                ul, ol { margin: 1em 0; padding-left: 2em; }
                img { max-width: 100%; height: auto; }
            </style>';
            echo '</head><body>';
            echo '<h1>' . htmlspecialchars($title) . '</h1>';
            echo '<div>' . $content . '</div>';
            echo '</body></html>';
            break;
            
        case 'txt':
            // Export as plain text
            header('Content-Type: text/plain; charset=UTF-8');
            header('Content-Disposition: attachment; filename="' . $filename . '.txt"');
            
            // Strip HTML tags and convert entities
            $text = strip_tags($content);
            $text = html_entity_decode($text, ENT_QUOTES | ENT_HTML5, 'UTF-8');
            
            // Clean up whitespace
            $text = preg_replace('/\s+/', ' ', $text);
            $text = trim($text);
            
            // Add title
            echo $title . "\n\n";
            echo str_repeat('=', strlen($title)) . "\n\n";
            echo $text;
            break;
    }
} catch (PDOException $e) {
    error_log("Export error: " . $e->getMessage());
    http_response_code(500);
    die('Error: ' . $e->getMessage());
} catch (Exception $e) {
    error_log("Export error: " . $e->getMessage());
    http_response_code(500);
    die('Error: ' . $e->getMessage());
}
?>
