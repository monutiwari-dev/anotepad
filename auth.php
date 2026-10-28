<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Credentials: true');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once 'config.php';

// Initialize database
if (!initDatabase()) {
    sendResponse(false, null, 'Failed to initialize database');
}

$db = getDB();
if (!$db) {
    sendResponse(false, null, 'Database connection failed');
}

try {
    $method = $_SERVER['REQUEST_METHOD'];
    
    if ($method === 'POST') {
        $action = isset($_POST['action']) ? $_POST['action'] : 'signin';
        $email = isset($_POST['email']) ? trim($_POST['email']) : '';
        $password = isset($_POST['password']) ? $_POST['password'] : '';
        $name = isset($_POST['name']) ? trim($_POST['name']) : '';
        
        if (empty($email) || empty($password)) {
            sendResponse(false, null, 'Email and password are required');
        }
        
        // Validate email format
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            sendResponse(false, null, 'Invalid email format');
        }
        
        if ($action === 'signup') {
            // Sign up - create new user
            if (empty($name)) {
                sendResponse(false, null, 'Name is required for sign up');
            }
            
            // Check if user already exists
            $stmt = $db->prepare("SELECT id FROM users WHERE email = ?");
            $stmt->execute([$email]);
            if ($stmt->fetch()) {
                sendResponse(false, null, 'Email already registered. Please sign in instead.');
            }
            
            // Hash password
            $passwordHash = password_hash($password, PASSWORD_DEFAULT);
            
            // Create new user
            $stmt = $db->prepare("INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)");
            $stmt->execute([$email, $passwordHash, $name]);
            $userId = $db->lastInsertId();
            
            // Set session
            $_SESSION['user_id'] = $userId;
            $_SESSION['email'] = $email;
            $_SESSION['name'] = $name;
            
            sendResponse(true, [
                'user' => [
                    'id' => $userId,
                    'email' => $email,
                    'name' => $name
                ]
            ], 'Account created successfully');
            
        } else {
            // Sign in - verify credentials
            $stmt = $db->prepare("SELECT id, email, password_hash, name FROM users WHERE email = ?");
            $stmt->execute([$email]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$user) {
                sendResponse(false, null, 'Invalid email or password');
            }
            
            // Check if user has a password hash
            if (empty($user['password_hash'])) {
                sendResponse(false, null, 'Account not set up properly. Please sign up again.');
            }
            
            // Verify password
            if (!password_verify($password, $user['password_hash'])) {
                sendResponse(false, null, 'Invalid email or password');
            }
            
            // Update last login
            $stmt = $db->prepare("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?");
            $stmt->execute([$user['id']]);
            
            // Set session
            $_SESSION['user_id'] = $user['id'];
            $_SESSION['email'] = $user['email'];
            $_SESSION['name'] = $user['name'];
            
            sendResponse(true, [
                'user' => [
                    'id' => $user['id'],
                    'email' => $user['email'],
                    'name' => $user['name']
                ]
            ], 'Sign in successful');
        }
        
    } elseif ($method === 'GET') {
        // Check if user is signed in
        if (isset($_SESSION['user_id'])) {
            sendResponse(true, [
                'user' => [
                    'id' => $_SESSION['user_id'],
                    'email' => $_SESSION['email'],
                    'name' => $_SESSION['name']
                ],
                'signed_in' => true
            ], 'User is signed in');
        } else {
            sendResponse(false, ['signed_in' => false], 'User is not signed in');
        }
        
    } elseif ($method === 'DELETE') {
        // Sign out
        session_destroy();
        sendResponse(true, null, 'Signed out successfully');
    }
    
} catch (PDOException $e) {
    error_log("Auth error: " . $e->getMessage());
    sendResponse(false, null, 'Error: ' . $e->getMessage());
} catch (Exception $e) {
    error_log("Auth error: " . $e->getMessage());
    sendResponse(false, null, 'Error: ' . $e->getMessage());
}
?>
