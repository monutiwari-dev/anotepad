# Server Deployment Guide

This guide will help you deploy aNotepad to a production server.

## Pre-Deployment Checklist

### 1. Server Requirements
- PHP 7.4 or higher
- PDO extension enabled
- SQLite support (PDO SQLite driver)
- Apache or Nginx web server
- HTTPS (required for PWA features like Service Workers)

### 2. File Permissions

After uploading files to your server, set proper permissions:

```bash
# Set directory permissions
chmod 755 /path/to/Anotepad

# Create data directory for database (if needed)
mkdir -p /path/to/Anotepad/data
chmod 755 /path/to/Anotepad/data

# Database file will be created automatically with proper permissions
# If it already exists:
chmod 666 /path/to/Anotepad/notes.db
# OR if using data subdirectory:
chmod 666 /path/to/Anotepad/data/notes.db
```

### 3. PHP Configuration

Ensure these PHP settings are configured:

```ini
; Enable PDO and SQLite
extension=pdo
extension=pdo_sqlite

; Session settings (auto-configured in config.php)
session.cookie_httponly = 1
session.use_only_cookies = 1
```

### 4. Apache Configuration

If using Apache, ensure:
- `mod_rewrite` is enabled
- `.htaccess` files are allowed
- `AllowOverride` is set to `All` or at least `FileInfo`

Example Apache virtual host configuration:
```apache
<VirtualHost *:443>
    ServerName yourdomain.com
    DocumentRoot /path/to/Anotepad
    
    <Directory /path/to/Anotepad>
        AllowOverride All
        Require all granted
    </Directory>
    
    # SSL Configuration
    SSLEngine on
    SSLCertificateFile /path/to/certificate.crt
    SSLCertificateKeyFile /path/to/private.key
</VirtualHost>
```

### 5. Nginx Configuration

If using Nginx, add this to your server block:

```nginx
server {
    listen 443 ssl;
    server_name yourdomain.com;
    root /path/to/Anotepad;
    index index.html index.php;

    # SSL Configuration
    ssl_certificate /path/to/certificate.crt;
    ssl_certificate_key /path/to/private.key;

    # PHP handling
    location ~ \.php$ {
        fastcgi_pass unix:/var/run/php/php7.4-fpm.sock;
        fastcgi_index index.php;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    }

    # Static files
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Service Worker
    location = /service-worker.js {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Content-Type "application/javascript";
    }

    # Manifest
    location = /manifest.json {
        add_header Content-Type "application/manifest+json";
    }

    # Deny access to database files
    location ~ \.db$ {
        deny all;
    }

    # Deny access to PHP config files
    location ~ \.php$ {
        # Only allow specific PHP files
        if ($uri !~ ^/(index|save|load|delete|auth|pin|folders|share|export|versions)\.php$) {
            return 403;
        }
    }
}
```

## Deployment Steps

### Step 1: Upload Files

Upload all files to your server using FTP, SFTP, or your hosting control panel.

**Important files to upload:**
- All `.php` files
- `index.html`
- `style.css`
- `script.js`
- `service-worker.js`
- `manifest.json`
- All icon files (`.png`)
- `.htaccess` (for Apache)

### Step 2: Set Permissions

```bash
# Navigate to your project directory
cd /path/to/Anotepad

# Set directory permissions
find . -type d -exec chmod 755 {} \;

# Set file permissions
find . -type f -exec chmod 644 {} \;

# Make PHP files executable (if needed)
find . -name "*.php" -exec chmod 644 {} \;
```

### Step 3: Create Writable Directory (if needed)

If the main directory isn't writable, the app will automatically try to use a `data/` subdirectory:

```bash
mkdir -p data
chmod 755 data
```

### Step 4: Test Database Creation

Visit your site and check if the database is created:

```bash
# Check if notes.db was created
ls -la notes.db
# OR
ls -la data/notes.db
```

### Step 5: Verify HTTPS

Service Workers require HTTPS (except localhost). Ensure your site is accessible via HTTPS:

```
https://yourdomain.com
```

### Step 6: Test Features

1. **Sign In/Sign Up** - Create an account
2. **Create Note** - Create a new note
3. **Save Note** - Verify auto-save works
4. **Pin Note** - Test pinning functionality
5. **Folders** - Create and use folders
6. **Export** - Test export functionality
7. **PWA** - Check if install prompt appears

## Common Issues and Solutions

### Issue 1: Database Permission Errors

**Error:** "Database connection failed" or "Failed to initialize database"

**Solution:**
```bash
# Check directory permissions
ls -la /path/to/Anotepad

# Fix permissions
chmod 755 /path/to/Anotepad
chmod 666 /path/to/Anotepad/notes.db  # If file exists

# Or create data directory
mkdir -p /path/to/Anotepad/data
chmod 755 /path/to/Anotepad/data
```

### Issue 2: Service Worker Not Registering

**Error:** Service Worker registration fails

**Causes:**
- Not using HTTPS (required for production)
- Wrong path to service-worker.js
- MIME type not set correctly

**Solution:**
- Ensure site is on HTTPS
- Check browser console for specific errors
- Verify `.htaccess` is working (Apache) or Nginx config is correct

### Issue 3: Session Not Working

**Error:** Users can't stay logged in

**Solution:**
- Check `config.php` - `session.cookie_secure` should be `1` for HTTPS
- Verify PHP sessions directory is writable: `php -i | grep session.save_path`
- Check server timezone settings

### Issue 4: 500 Internal Server Error

**Causes:**
- PHP errors
- Missing PHP extensions
- Permission issues

**Solution:**
- Check PHP error logs: `/var/log/php_errors.log` or check with hosting provider
- Enable error logging in `config.php` temporarily
- Verify all required PHP extensions are installed

### Issue 5: Features Not Working After Upload

**Common causes:**
- JavaScript errors (check browser console)
- CORS issues
- Path issues (subdirectory deployment)

**Solution:**
- Open browser Developer Tools (F12)
- Check Console tab for JavaScript errors
- Check Network tab for failed requests
- Verify all file paths are correct

### Issue 6: Subdirectory Deployment

If deploying to a subdirectory (e.g., `https://domain.com/notepad/`):

1. Service Worker path is already relative (fixed in code)
2. Ensure all asset paths in HTML are relative
3. Update `.htaccess` if needed for subdirectory

## Security Recommendations

1. **Protect Database File:**
   ```apache
   # In .htaccess
   <FilesMatch "\.db$">
       Order allow,deny
       Deny from all
   </FilesMatch>
   ```

2. **Hide PHP Errors in Production:**
   Already configured in `config.php` - `display_errors` is set to `0`

3. **Use HTTPS:**
   Required for PWA features and better security

4. **Regular Backups:**
   Backup `notes.db` file regularly

5. **Update PHP:**
   Keep PHP version updated for security patches

## Testing Checklist

After deployment, test:

- [ ] Site loads correctly
- [ ] HTTPS is working
- [ ] Can create account (Sign Up)
- [ ] Can sign in
- [ ] Can create new note
- [ ] Auto-save works
- [ ] Can pin/unpin notes
- [ ] Can create folders
- [ ] Can move notes to folders
- [ ] Can delete notes
- [ ] Can export notes
- [ ] Service Worker registers
- [ ] PWA install prompt appears (if supported)
- [ ] Works on mobile devices
- [ ] Works offline (after first load)

## Support

If you encounter issues:

1. Check browser console (F12) for errors
2. Check server error logs
3. Verify file permissions
4. Test with a fresh browser (clear cache)
5. Check `db_error.log` file for database errors

## MySQL Alternative

If SQLite doesn't work on your server, you can switch to MySQL:

1. Edit `config.php`:
   ```php
   define('DB_TYPE', 'mysql');
   define('DB_HOST', 'localhost');
   define('DB_NAME', 'your_database_name');
   define('DB_USER', 'your_username');
   define('DB_PASS', 'your_password');
   ```

2. Create the database and user in MySQL

3. The tables will be created automatically on first use
