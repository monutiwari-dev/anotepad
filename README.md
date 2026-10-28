# AnoNotepad - Modern Online Notepad Tool

A beautiful, feature-rich online notepad application built with HTML, CSS, JavaScript (Java), and PHP.

## Features

### ✨ Unique Features
- **Auto-Save**: Automatically saves your notes every 30 seconds
- **Rich Text Editor**: Format text with bold, italic, underline, headings, lists, and links
- **Dark/Light Theme**: Toggle between themes with one click
- **Search Functionality**: Quickly find notes by title or content
- **Export/Import**: Export notes as HTML files or import existing notes
- **Word & Character Count**: Real-time statistics as you type
- **Multiple Notes Management**: Create, edit, and organize multiple notes
- **Responsive Design**: Works perfectly on desktop, tablet, and mobile devices
- **Image Support**: Insert images via URL
- **Timestamps**: See when notes were created and last updated

## Requirements

- PHP 7.4 or higher
- PDO extension enabled
- SQLite support (included in most PHP installations)
- Web server (Apache, Nginx, or PHP built-in server)

## Installation

1. **Clone or download** this repository to your web server directory

2. **Set permissions** (if needed):
   ```bash
   chmod 755 /path/to/Anotepad
   chmod 666 /path/to/Anotepad/notes.db  # After first run
   ```

3. **Initialize the database** (optional - auto-creates on first use):
   ```bash
   php init.php
   ```

4. **Start the web server**:
   
   **Using PHP built-in server:**
   ```bash
   php -S localhost:8000
   ```
   
   **Or use Apache/Nginx** - place files in your web root directory

5. **Open in browser**:
   ```
   http://localhost:8000
   ```

## File Structure

```
Anotepad/
├── index.html          # Main HTML file
├── style.css           # Stylesheet with modern design
├── script.js           # JavaScript for interactivity
├── config.php          # Database configuration
├── save.php            # Save/update notes endpoint
├── load.php            # Load notes endpoint
├── delete.php          # Delete notes endpoint
├── init.php            # Database initialization script
├── .htaccess           # Apache configuration
├── notes.db            # SQLite database (auto-created)
└── README.md           # This file
```

## Usage

1. **Create a new note**: Click the "+" button or start typing
2. **Format text**: Use the toolbar buttons for formatting
3. **Save note**: Click "Save" or wait for auto-save (every 30 seconds)
4. **Search notes**: Use the search box in the sidebar
5. **Export note**: Click the download icon to export as HTML
6. **Import note**: Click the upload icon to import an HTML file
7. **Toggle theme**: Click the moon/sun icon in the header
8. **Delete note**: Click the "Delete" button in the footer

## Database

The application uses SQLite by default, which creates a `notes.db` file automatically. The database will be initialized on first use.

### Switching to MySQL

To use MySQL instead of SQLite:

1. Edit `config.php` and uncomment the MySQL configuration
2. Update database credentials
3. Change `DB_TYPE` to `'mysql'`
4. Run `init.php` to create tables

## Security Notes

- The `.htaccess` file protects the database file from direct access
- Input is sanitized before database operations
- Consider adding authentication for production use
- Disable error display in production (edit `config.php`)

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Customization

### Changing Colors

Edit the CSS variables in `style.css`:
```css
:root {
    --primary-color: #6366f1;
    --secondary-color: #8b5cf6;
    /* ... */
}
```

### Changing Auto-Save Interval

Edit `script.js`:
```javascript
setInterval(() => {
    // Change 30000 to desired milliseconds
}, 30000);
```

## Troubleshooting

**Database errors:**
- Ensure PHP has write permissions in the directory
- Check that PDO and SQLite extensions are enabled
- Run `php init.php` manually

**Notes not saving:**
- Check browser console for errors
- Verify PHP error logs
- Ensure database file is writable

**Styling issues:**
- Clear browser cache
- Check that `style.css` is loading correctly

## License

Free to use and modify for personal or commercial projects.

## Credits

Built with modern web technologies:
- HTML5
- CSS3 (with CSS Variables)
- Vanilla JavaScript
- PHP 7.4+
- SQLite/MySQL

---

Enjoy your modern notepad experience! 📝✨
