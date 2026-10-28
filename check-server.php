<?php
/**
 * Server Diagnostics Script
 * 
 * This script checks if your server meets the requirements for aNotepad.
 * Access it via: https://yourdomain.com/check-server.php
 * 
 * IMPORTANT: Delete this file after checking, or protect it with .htaccess
 */

header('Content-Type: text/html; charset=utf-8');
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Server Diagnostics - aNotepad</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            max-width: 800px;
            margin: 50px auto;
            padding: 20px;
            background: #f5f5f5;
        }
        .container {
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
            color: #333;
            border-bottom: 2px solid #6366f1;
            padding-bottom: 10px;
        }
        .check {
            margin: 15px 0;
            padding: 15px;
            border-radius: 5px;
            border-left: 4px solid #ccc;
        }
        .check.pass {
            background: #d4edda;
            border-color: #28a745;
        }
        .check.fail {
            background: #f8d7da;
            border-color: #dc3545;
        }
        .check.warning {
            background: #fff3cd;
            border-color: #ffc107;
        }
        .check-title {
            font-weight: bold;
            margin-bottom: 5px;
        }
        .check-detail {
            font-size: 0.9em;
            color: #666;
            margin-top: 5px;
        }
        .summary {
            margin-top: 30px;
            padding: 20px;
            background: #e7f3ff;
            border-radius: 5px;
        }
        code {
            background: #f4f4f4;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Courier New', monospace;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔍 Server Diagnostics - aNotepad</h1>
        
        <?php
        $checks = [];
        $allPassed = true;
        
        // Check PHP Version
        $phpVersion = phpversion();
        $phpRequired = '7.4.0';
        $phpOk = version_compare($phpVersion, $phpRequired, '>=');
        $checks[] = [
            'title' => 'PHP Version',
            'status' => $phpOk ? 'pass' : 'fail',
            'message' => $phpOk ? "PHP {$phpVersion} (Required: {$phpRequired})" : "PHP {$phpVersion} is too old. Required: {$phpRequired}",
            'detail' => $phpOk ? '' : 'Please upgrade PHP to version 7.4 or higher.'
        ];
        if (!$phpOk) $allPassed = false;
        
        // Check PDO Extension
        $pdoExists = extension_loaded('pdo');
        $checks[] = [
            'title' => 'PDO Extension',
            'status' => $pdoExists ? 'pass' : 'fail',
            'message' => $pdoExists ? 'PDO extension is loaded' : 'PDO extension is not loaded',
            'detail' => $pdoExists ? '' : 'Install PDO extension: apt-get install php-pdo (or similar)'
        ];
        if (!$pdoExists) $allPassed = false;
        
        // Check SQLite Support
        $sqliteExists = extension_loaded('pdo_sqlite');
        $checks[] = [
            'title' => 'PDO SQLite Driver',
            'status' => $sqliteExists ? 'pass' : 'fail',
            'message' => $sqliteExists ? 'PDO SQLite driver is available' : 'PDO SQLite driver is not available',
            'detail' => $sqliteExists ? '' : 'Install SQLite: apt-get install php-sqlite3 (or similar)'
        ];
        if (!$sqliteExists) $allPassed = false;
        
        // Check if directory is writable
        $dirWritable = is_writable(__DIR__);
        $checks[] = [
            'title' => 'Directory Writable',
            'status' => $dirWritable ? 'pass' : 'warning',
            'message' => $dirWritable ? 'Current directory is writable' : 'Current directory is not writable',
            'detail' => $dirWritable ? '' : 'The app will try to use a data/ subdirectory. Run: chmod 755 ' . __DIR__
        ];
        
        // Check data directory
        $dataDir = __DIR__ . '/data';
        $dataDirExists = is_dir($dataDir);
        $dataDirWritable = $dataDirExists && is_writable($dataDir);
        if (!$dataDirExists) {
            $checks[] = [
                'title' => 'Data Directory',
                'status' => 'warning',
                'message' => 'Data directory does not exist (will be created if needed)',
                'detail' => 'The app can create this automatically, or you can create it manually: mkdir data && chmod 755 data'
            ];
        } else {
            $checks[] = [
                'title' => 'Data Directory',
                'status' => $dataDirWritable ? 'pass' : 'fail',
                'message' => $dataDirWritable ? 'Data directory exists and is writable' : 'Data directory exists but is not writable',
                'detail' => $dataDirWritable ? '' : 'Run: chmod 755 ' . $dataDir
            ];
        }
        
        // Check HTTPS
        $isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || 
                   (!empty($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https') ||
                   (!empty($_SERVER['HTTP_X_FORWARDED_SSL']) && $_SERVER['HTTP_X_FORWARDED_SSL'] === 'on') ||
                   (isset($_SERVER['SERVER_PORT']) && $_SERVER['SERVER_PORT'] == 443);
        $checks[] = [
            'title' => 'HTTPS',
            'status' => $isHttps ? 'pass' : 'warning',
            'message' => $isHttps ? 'Site is served over HTTPS' : 'Site is not served over HTTPS',
            'detail' => $isHttps ? '' : 'HTTPS is required for PWA features (Service Workers). Required for production.'
        ];
        
        // Check Session Support
        $sessionOk = function_exists('session_start');
        $checks[] = [
            'title' => 'Session Support',
            'status' => $sessionOk ? 'pass' : 'fail',
            'message' => $sessionOk ? 'PHP sessions are available' : 'PHP sessions are not available',
            'detail' => $sessionOk ? '' : 'Sessions are required for user authentication'
        ];
        if (!$sessionOk) $allPassed = false;
        
        // Check JSON Support
        $jsonOk = function_exists('json_encode') && function_exists('json_decode');
        $checks[] = [
            'title' => 'JSON Support',
            'status' => $jsonOk ? 'pass' : 'fail',
            'message' => $jsonOk ? 'JSON functions are available' : 'JSON functions are not available',
            'detail' => $jsonOk ? '' : 'JSON is required for API responses'
        ];
        if (!$jsonOk) $allPassed = false;
        
        // Check .htaccess support (Apache)
        $isApache = strpos($_SERVER['SERVER_SOFTWARE'] ?? '', 'Apache') !== false;
        $htaccessExists = file_exists(__DIR__ . '/.htaccess');
        if ($isApache) {
            $checks[] = [
                'title' => '.htaccess File',
                'status' => $htaccessExists ? 'pass' : 'warning',
                'message' => $htaccessExists ? '.htaccess file exists' : '.htaccess file not found',
                'detail' => $htaccessExists ? '' : 'Make sure .htaccess is uploaded and AllowOverride is enabled'
            ];
        }
        
        // Check database file
        $dbPath = __DIR__ . '/notes.db';
        $dbExists = file_exists($dbPath);
        $dbWritable = $dbExists && is_writable($dbPath);
        if ($dbExists) {
            $checks[] = [
                'title' => 'Database File',
                'status' => $dbWritable ? 'pass' : 'fail',
                'message' => $dbWritable ? 'Database file exists and is writable' : 'Database file exists but is not writable',
                'detail' => $dbWritable ? '' : 'Run: chmod 666 ' . $dbPath
            ];
        } else {
            $checks[] = [
                'title' => 'Database File',
                'status' => 'pass',
                'message' => 'Database file will be created automatically on first use',
                'detail' => ''
            ];
        }
        
        // Display all checks
        foreach ($checks as $check) {
            echo '<div class="check ' . $check['status'] . '">';
            echo '<div class="check-title">' . $check['title'] . '</div>';
            echo '<div>' . $check['message'] . '</div>';
            if (!empty($check['detail'])) {
                echo '<div class="check-detail">' . $check['detail'] . '</div>';
            }
            echo '</div>';
        }
        
        // Summary
        echo '<div class="summary">';
        if ($allPassed) {
            echo '<h2>✅ All Critical Checks Passed!</h2>';
            echo '<p>Your server appears to be configured correctly. The application should work properly.</p>';
        } else {
            echo '<h2>❌ Some Checks Failed</h2>';
            echo '<p>Please fix the issues marked in red before deploying the application.</p>';
        }
        echo '<p><strong>Server Software:</strong> ' . ($_SERVER['SERVER_SOFTWARE'] ?? 'Unknown') . '</p>';
        echo '<p><strong>PHP Version:</strong> ' . phpversion() . '</p>';
        echo '<p><strong>Document Root:</strong> <code>' . __DIR__ . '</code></p>';
        echo '</div>';
        
        echo '<div style="margin-top: 30px; padding: 15px; background: #fff3cd; border-radius: 5px;">';
        echo '<strong>⚠️ Security Note:</strong> Delete this file (<code>check-server.php</code>) after checking your server configuration.';
        echo '</div>';
        ?>
    </div>
</body>
</html>
