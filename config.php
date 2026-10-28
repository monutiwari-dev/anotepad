<?php
// Database Configuration
// Use a writable directory for the database file
$dbDir = __DIR__;
// Ensure the directory is writable
if (!is_writable($dbDir)) {
    // Try to create a data subdirectory if main directory isn't writable
    $dataDir = __DIR__ . '/data';
    if (!is_dir($dataDir)) {
        @mkdir($dataDir, 0755, true);
    }
    if (is_dir($dataDir) && is_writable($dataDir)) {
        $dbDir = $dataDir;
    }
}
define('DB_PATH', $dbDir . '/notes.db');
define('DB_TYPE', 'sqlite'); // Can be changed to 'mysql' if needed

// For MySQL (uncomment and configure if needed)
/*
define('DB_HOST', 'localhost');
define('DB_NAME', 'notepad_db');
define('DB_USER', 'root');
define('DB_PASS', '');
*/

// Authentication is now handled via email/password (no Google OAuth needed)

// Session Configuration
if (session_status() === PHP_SESSION_NONE) {
    ini_set('session.cookie_httponly', 1);
    ini_set('session.use_only_cookies', 1);
    // Auto-detect HTTPS
    $isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || 
               (!empty($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https') ||
               (!empty($_SERVER['HTTP_X_FORWARDED_SSL']) && $_SERVER['HTTP_X_FORWARDED_SSL'] === 'on') ||
               (isset($_SERVER['SERVER_PORT']) && $_SERVER['SERVER_PORT'] == 443);
    ini_set('session.cookie_secure', $isHttps ? 1 : 0);
    session_start();
}

// Timezone
date_default_timezone_set('UTC');

// Error Reporting (disable in production)
error_reporting(E_ALL);
ini_set('display_errors', 0); // Changed to 0 to prevent output before JSON
ini_set('log_errors', 1);

// Only set headers if this is a direct request (not included)
if (!defined('CONFIG_INCLUDED')) {
    define('CONFIG_INCLUDED', true);
    
    // Headers for JSON responses
    header('Content-Type: application/json');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    
    // Handle preflight requests
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(200);
        exit();
    }
}

// Database Connection Function
function getDB() {
    try {
        if (DB_TYPE === 'sqlite') {
            // Ensure directory exists and is writable
            $dbDir = dirname(DB_PATH);
            if (!is_dir($dbDir)) {
                @mkdir($dbDir, 0755, true);
            }
            
            // Check if directory is writable
            if (!is_writable($dbDir)) {
                error_log("Database directory is not writable: " . $dbDir);
                // Try to fix permissions (may not work on all servers)
                @chmod($dbDir, 0755);
            }
            
            // Create database file if it doesn't exist
            if (!file_exists(DB_PATH)) {
                $created = @touch(DB_PATH);
                if ($created) {
                    @chmod(DB_PATH, 0666);
                } else {
                    error_log("Failed to create database file. Check directory permissions: " . $dbDir);
                }
            } else {
                // Ensure existing database file is writable
                if (!is_writable(DB_PATH)) {
                    @chmod(DB_PATH, 0666);
                }
            }
            
            $db = new PDO('sqlite:' . DB_PATH);
            $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            return $db;
        } else {
            // MySQL connection
            $dsn = "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8mb4";
            $db = new PDO($dsn, DB_USER, DB_PASS);
            $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            return $db;
        }
    } catch (PDOException $e) {
        error_log("Database connection error: " . $e->getMessage());
        return null;
    }
}

// Initialize Database
function initDatabase() {
    $db = getDB();
    if (!$db) {
        error_log("Cannot get database connection in initDatabase()");
        return false;
    }
    
    try {
        if (DB_TYPE === 'sqlite') {
            // Check if users table exists and migrate if needed
            try {
                $tableExists = false;
                $hasGoogleId = false;
                $hasPasswordHash = false;
                
                $result = $db->query("SELECT name FROM sqlite_master WHERE type='table' AND name='users'");
                if ($result && $result->fetch()) {
                    $tableExists = true;
                    // Check columns
                    $columnsResult = $db->query("PRAGMA table_info(users)");
                    if ($columnsResult) {
                        $columnsData = $columnsResult->fetchAll(PDO::FETCH_ASSOC);
                        $columns = array_column($columnsData, 'name');
                        $hasGoogleId = in_array('google_id', $columns);
                        $hasPasswordHash = in_array('password_hash', $columns);
                    }
                }
                
                if (!$tableExists) {
                    // Create new users table
                    $db->exec("CREATE TABLE users (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        email TEXT UNIQUE NOT NULL,
                        password_hash TEXT NOT NULL,
                        name TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        last_login DATETIME DEFAULT CURRENT_TIMESTAMP
                    )");
                } else {
                    // Table exists - migrate if needed
                    if ($hasGoogleId) {
                        // Old Google auth schema - migrate to new schema
                        // SQLite doesn't support DROP COLUMN, so we need to recreate the table
                        $db->beginTransaction();
                        try {
                            // Backup existing data if any (only users with password_hash)
                            $existingUsers = [];
                            try {
                                $stmt = $db->query("SELECT id, email, password_hash, name, created_at, last_login FROM users WHERE email IS NOT NULL AND email != '' AND password_hash IS NOT NULL AND password_hash != ''");
                                $existingUsers = $stmt->fetchAll(PDO::FETCH_ASSOC);
                            } catch (PDOException $e) {
                                // No existing users or error reading
                            }
                            
                            // Drop old table
                            $db->exec("DROP TABLE IF EXISTS users");
                            
                            // Create new table without google_id
                            $db->exec("CREATE TABLE users (
                                id INTEGER PRIMARY KEY AUTOINCREMENT,
                                email TEXT UNIQUE NOT NULL,
                                password_hash TEXT NOT NULL,
                                name TEXT,
                                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                last_login DATETIME DEFAULT CURRENT_TIMESTAMP
                            )");
                            
                            // Restore existing users with passwords
                            if (!empty($existingUsers)) {
                                $stmt = $db->prepare("INSERT INTO users (id, email, password_hash, name, created_at, last_login) VALUES (?, ?, ?, ?, ?, ?)");
                                foreach ($existingUsers as $user) {
                                    $stmt->execute([
                                        $user['id'],
                                        $user['email'],
                                        $user['password_hash'],
                                        $user['name'],
                                        $user['created_at'],
                                        $user['last_login']
                                    ]);
                                }
                            }
                            
                            $db->commit();
                            error_log("Users table migrated from Google auth to email/password auth");
                        } catch (PDOException $e) {
                            $db->rollBack();
                            error_log("Users migration error: " . $e->getMessage());
                            throw $e;
                        }
                    } else {
                        // Add password_hash if it doesn't exist
                        if (!$hasPasswordHash) {
                            $db->exec("ALTER TABLE users ADD COLUMN password_hash TEXT NOT NULL DEFAULT ''");
                        } else {
                            // Ensure password_hash is NOT NULL (it might be nullable)
                            // SQLite doesn't support MODIFY COLUMN, so we need to check and potentially recreate
                            $columnsResult = $db->query("PRAGMA table_info(users)");
                            $passwordHashNullable = false;
                            if ($columnsResult) {
                                $columnsData = $columnsResult->fetchAll(PDO::FETCH_ASSOC);
                                foreach ($columnsData as $col) {
                                    if ($col['name'] === 'password_hash' && $col['notnull'] == 0) {
                                        $passwordHashNullable = true;
                                        break;
                                    }
                                }
                            }
                            
                            // If password_hash is nullable, we need to fix it
                            // But since SQLite doesn't support MODIFY, we'll handle it on insert
                            // The INSERT statement in auth.php already provides password_hash, so this should be OK
                        }
                    }
                }
            } catch (PDOException $e) {
                error_log("Users table setup error: " . $e->getMessage());
                // Try to create table anyway
                try {
                    $db->exec("CREATE TABLE IF NOT EXISTS users (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        email TEXT UNIQUE NOT NULL,
                        password_hash TEXT NOT NULL,
                        name TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        last_login DATETIME DEFAULT CURRENT_TIMESTAMP
                    )");
                } catch (PDOException $e2) {
                    error_log("Failed to create users table: " . $e2->getMessage());
                }
            }
            
            // First, create the notes table if it doesn't exist
            $db->exec("CREATE TABLE IF NOT EXISTS notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                preview TEXT,
                folder_id INTEGER DEFAULT NULL,
                is_pinned INTEGER DEFAULT 0,
                is_archived INTEGER DEFAULT 0,
                is_deleted INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )");
            
            // Migrate existing notes - add new columns if they don't exist
            // This MUST happen before creating indexes
            // Use a transaction to ensure atomicity
            $db->beginTransaction();
            try {
                $columnsResult = $db->query("PRAGMA table_info(notes)");
                $columns = [];
                if ($columnsResult) {
                    $columnsData = $columnsResult->fetchAll(PDO::FETCH_ASSOC);
                    $columns = array_column($columnsData, 'name');
                }
                
                $columnsAdded = false;
                if (!in_array('user_id', $columns)) {
                    $db->exec("ALTER TABLE notes ADD COLUMN user_id INTEGER DEFAULT NULL");
                    $columnsAdded = true;
                }
                if (!in_array('folder_id', $columns)) {
                    $db->exec("ALTER TABLE notes ADD COLUMN folder_id INTEGER DEFAULT NULL");
                    $columnsAdded = true;
                }
                if (!in_array('is_pinned', $columns)) {
                    $db->exec("ALTER TABLE notes ADD COLUMN is_pinned INTEGER DEFAULT 0");
                    $columnsAdded = true;
                }
                if (!in_array('is_archived', $columns)) {
                    $db->exec("ALTER TABLE notes ADD COLUMN is_archived INTEGER DEFAULT 0");
                    $columnsAdded = true;
                }
                if (!in_array('is_deleted', $columns)) {
                    $db->exec("ALTER TABLE notes ADD COLUMN is_deleted INTEGER DEFAULT 0");
                    $columnsAdded = true;
                }
                
                $db->commit();
                
                // If columns were added, refresh the columns list
                if ($columnsAdded) {
                    $columnsResult = $db->query("PRAGMA table_info(notes)");
                    if ($columnsResult) {
                        $columnsData = $columnsResult->fetchAll(PDO::FETCH_ASSOC);
                        $columns = array_column($columnsData, 'name');
                    }
                }
            } catch (PDOException $e) {
                $db->rollBack();
                // If table doesn't exist yet, that's fine - it will be created above
                // Just log and continue
                error_log("Migration check error (this is OK if table is new): " . $e->getMessage());
                // Re-query columns after rollback
                try {
                    $columnsResult = $db->query("PRAGMA table_info(notes)");
                    $columns = [];
                    if ($columnsResult) {
                        $columnsData = $columnsResult->fetchAll(PDO::FETCH_ASSOC);
                        $columns = array_column($columnsData, 'name');
                    }
                } catch (PDOException $e2) {
                    error_log("Error querying table info after rollback: " . $e2->getMessage());
                    $columns = [];
                }
            }
            
            // Create indexes AFTER ensuring all columns exist
            // Wrap in try-catch to handle cases where indexes might already exist
            try {
                $db->exec("CREATE INDEX IF NOT EXISTS idx_title ON notes(title)");
                $db->exec("CREATE INDEX IF NOT EXISTS idx_created ON notes(created_at)");
                
                // Verify columns exist before creating indexes
                $columnsResult = $db->query("PRAGMA table_info(notes)");
                $columns = [];
                if ($columnsResult) {
                    $columnsData = $columnsResult->fetchAll(PDO::FETCH_ASSOC);
                    $columns = array_column($columnsData, 'name');
                }
                
                // Only create indexes if columns actually exist
                if (in_array('is_pinned', $columns)) {
                    $db->exec("CREATE INDEX IF NOT EXISTS idx_pinned ON notes(is_pinned)");
                }
                if (in_array('is_archived', $columns)) {
                    $db->exec("CREATE INDEX IF NOT EXISTS idx_archived ON notes(is_archived)");
                }
                if (in_array('is_deleted', $columns)) {
                    $db->exec("CREATE INDEX IF NOT EXISTS idx_deleted ON notes(is_deleted)");
                }
                if (in_array('folder_id', $columns)) {
                    $db->exec("CREATE INDEX IF NOT EXISTS idx_folder ON notes(folder_id)");
                }
                if (in_array('user_id', $columns)) {
                    $db->exec("CREATE INDEX IF NOT EXISTS idx_user ON notes(user_id)");
                }
            } catch (PDOException $e) {
                // Index creation errors are not critical, log and continue
                error_log("Index creation warning: " . $e->getMessage());
            }
            
            // Create folders table
            $db->exec("CREATE TABLE IF NOT EXISTS folders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                parent_id INTEGER DEFAULT NULL,
                color TEXT DEFAULT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )");
            
            // Migrate existing folders - add user_id if it doesn't exist
            try {
                $columnsResult = $db->query("PRAGMA table_info(folders)");
                $columns = [];
                if ($columnsResult) {
                    $columnsData = $columnsResult->fetchAll(PDO::FETCH_ASSOC);
                    $columns = array_column($columnsData, 'name');
                }
                
                if (!in_array('user_id', $columns)) {
                    $db->exec("ALTER TABLE folders ADD COLUMN user_id INTEGER DEFAULT NULL");
                }
            } catch (PDOException $e) {
                error_log("Folders migration check error: " . $e->getMessage());
            }
            
            // Create share_links table
            $db->exec("CREATE TABLE IF NOT EXISTS share_links (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                share_token TEXT UNIQUE NOT NULL,
                note_id INTEGER NOT NULL,
                permission TEXT NOT NULL DEFAULT 'read',
                password_hash TEXT DEFAULT NULL,
                expiry_date DATETIME DEFAULT NULL,
                access_count INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
            )");
            
            // Create index on share_token for fast lookups
            $db->exec("CREATE INDEX IF NOT EXISTS idx_share_token ON share_links(share_token)");
            $db->exec("CREATE INDEX IF NOT EXISTS idx_share_note ON share_links(note_id)");
            
            // Create note_versions table for version history
            $db->exec("CREATE TABLE IF NOT EXISTS note_versions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                note_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
            )");
            
            // Create indexes for version history
            $db->exec("CREATE INDEX IF NOT EXISTS idx_version_note ON note_versions(note_id)");
            $db->exec("CREATE INDEX IF NOT EXISTS idx_version_created ON note_versions(created_at)");
        } else {
            // MySQL table creation
            // Check if users table exists and migrate if needed
            try {
                $result = $db->query("SHOW TABLES LIKE 'users'");
                $tableExists = $result && $result->rowCount() > 0;
                
                if ($tableExists) {
                    // Check if google_id column exists
                    $result = $db->query("SHOW COLUMNS FROM users LIKE 'google_id'");
                    $hasGoogleId = $result && $result->rowCount() > 0;
                    
                    $result = $db->query("SHOW COLUMNS FROM users LIKE 'password_hash'");
                    $hasPasswordHash = $result && $result->rowCount() > 0;
                    
                    if ($hasGoogleId && !$hasPasswordHash) {
                        // Migrate from Google auth to email/password
                        $db->exec("ALTER TABLE users 
                            DROP COLUMN google_id,
                            DROP COLUMN picture,
                            ADD COLUMN password_hash VARCHAR(255) NOT NULL DEFAULT ''");
                    } else if (!$hasPasswordHash) {
                        // Add password_hash if missing
                        $db->exec("ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NOT NULL DEFAULT ''");
                    }
                    
                    // Ensure email is unique and not null
                    try {
                        $db->exec("ALTER TABLE users MODIFY email VARCHAR(255) UNIQUE NOT NULL");
                    } catch (PDOException $e) {
                        // Ignore if already set
                    }
                } else {
                    // Create new users table
                    $db->exec("CREATE TABLE users (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        email VARCHAR(255) UNIQUE NOT NULL,
                        password_hash VARCHAR(255) NOT NULL,
                        name VARCHAR(255),
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        last_login DATETIME DEFAULT CURRENT_TIMESTAMP,
                        INDEX idx_email (email)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
                }
            } catch (PDOException $e) {
                error_log("Users table setup error: " . $e->getMessage());
                // Try to create table anyway
                try {
                    $db->exec("CREATE TABLE IF NOT EXISTS users (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        email VARCHAR(255) UNIQUE NOT NULL,
                        password_hash VARCHAR(255) NOT NULL,
                        name VARCHAR(255),
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        last_login DATETIME DEFAULT CURRENT_TIMESTAMP,
                        INDEX idx_email (email)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
                } catch (PDOException $e2) {
                    error_log("Failed to create users table: " . $e2->getMessage());
                }
            }
            
            $db->exec("CREATE TABLE IF NOT EXISTS notes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                title VARCHAR(255) NOT NULL,
                content TEXT NOT NULL,
                preview TEXT,
                folder_id INT DEFAULT NULL,
                is_pinned TINYINT(1) DEFAULT 0,
                is_archived TINYINT(1) DEFAULT 0,
                is_deleted TINYINT(1) DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_title (title),
                INDEX idx_created (created_at),
                INDEX idx_pinned (is_pinned),
                INDEX idx_archived (is_archived),
                INDEX idx_deleted (is_deleted),
                INDEX idx_folder (folder_id),
                INDEX idx_user (user_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
            
            // Migrate existing notes - add user_id if it doesn't exist
            try {
                $result = $db->query("SHOW COLUMNS FROM notes LIKE 'user_id'");
                $hasUserId = $result && $result->rowCount() > 0;
                if (!$hasUserId) {
                    $db->exec("ALTER TABLE notes ADD COLUMN user_id INT DEFAULT NULL");
                    $db->exec("ALTER TABLE notes ADD INDEX idx_user (user_id)");
                }
            } catch (PDOException $e) {
                error_log("Notes migration check error: " . $e->getMessage());
            }
            
            // Create folders table
            $db->exec("CREATE TABLE IF NOT EXISTS folders (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                name VARCHAR(255) NOT NULL,
                parent_id INT DEFAULT NULL,
                color VARCHAR(7) DEFAULT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_user (user_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
            
            // Migrate existing folders - add user_id if it doesn't exist
            try {
                $result = $db->query("SHOW COLUMNS FROM folders LIKE 'user_id'");
                $hasUserId = $result && $result->rowCount() > 0;
                if (!$hasUserId) {
                    $db->exec("ALTER TABLE folders ADD COLUMN user_id INT DEFAULT NULL");
                    $db->exec("ALTER TABLE folders ADD INDEX idx_user (user_id)");
                }
            } catch (PDOException $e) {
                error_log("Folders migration check error: " . $e->getMessage());
            }
            
            // Create share_links table
            $db->exec("CREATE TABLE IF NOT EXISTS share_links (
                id INT AUTO_INCREMENT PRIMARY KEY,
                share_token VARCHAR(64) UNIQUE NOT NULL,
                note_id INT NOT NULL,
                permission ENUM('read', 'edit') NOT NULL DEFAULT 'read',
                password_hash VARCHAR(255) DEFAULT NULL,
                expiry_date DATETIME DEFAULT NULL,
                access_count INT DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_share_token (share_token),
                INDEX idx_share_note (note_id),
                FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
            
            // Create note_versions table for version history
            $db->exec("CREATE TABLE IF NOT EXISTS note_versions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                note_id INT NOT NULL,
                title VARCHAR(255) NOT NULL,
                content TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_version_note (note_id),
                INDEX idx_version_created (created_at),
                FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        }
        
        return true;
    } catch (PDOException $e) {
        $errorMsg = "Database initialization error: " . $e->getMessage();
        error_log($errorMsg);
        // Also log to a file for debugging
        @file_put_contents(__DIR__ . '/db_error.log', date('Y-m-d H:i:s') . " - " . $errorMsg . "\n", FILE_APPEND);
        return false;
    } catch (Exception $e) {
        $errorMsg = "General database error: " . $e->getMessage();
        error_log($errorMsg);
        @file_put_contents(__DIR__ . '/db_error.log', date('Y-m-d H:i:s') . " - " . $errorMsg . "\n", FILE_APPEND);
        return false;
    }
}

// Helper function to generate preview
function generatePreview($content, $length = 100) {
    $text = strip_tags($content);
    $text = html_entity_decode($text, ENT_QUOTES, 'UTF-8');
    $text = trim($text);
    
    if (strlen($text) > $length) {
        $text = substr($text, 0, $length) . '...';
    }
    
    return $text;
}

// Helper function to send JSON response
function sendResponse($success, $data = null, $message = '') {
    $response = [
        'success' => $success,
        'message' => $message
    ];
    
    if ($data !== null) {
        $response = array_merge($response, $data);
    }
    
    echo json_encode($response);
    exit();
}
?>
