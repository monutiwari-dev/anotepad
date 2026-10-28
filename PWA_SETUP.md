# PWA Setup Guide for aNotepad

This guide explains how to set up Progressive Web App (PWA) functionality for aNotepad.

## What is PWA?

Progressive Web Apps allow users to:
- Install the app on their device (home screen)
- Use the app offline
- Get a native app-like experience
- Receive push notifications (optional)

## Files Added

1. **manifest.json** - Defines app metadata, icons, and display settings
2. **service-worker.js** - Handles offline functionality and caching
3. **icon-generator.html** - Tool to generate PWA icons
4. **create-icons.php** - PHP script to generate icons programmatically

## Setup Steps

### 1. Generate PWA Icons

You need to create icon files for the PWA. Choose one method:

#### Method A: Using the HTML Generator (Recommended)
1. Open `icon-generator.html` in your browser
2. Click "Generate Icons"
3. Click "Download All Icons" or download each icon individually
4. Save all icons in the root directory with these names:
   - `icon-72x72.png`
   - `icon-96x96.png`
   - `icon-128x128.png`
   - `icon-144x144.png`
   - `icon-152x152.png`
   - `icon-192x192.png`
   - `icon-384x384.png`
   - `icon-512x512.png`

#### Method B: Using PHP Script
```bash
php create-icons.php
```
This requires the GD library to be installed in PHP.

#### Method C: Create Icons Manually
Create PNG icons with the sizes listed above. Use a design tool like:
- Figma
- Canva
- Photoshop
- GIMP

### 2. Verify Files

Make sure these files exist in your root directory:
- ✅ `manifest.json`
- ✅ `service-worker.js`
- ✅ `icon-*.png` (all 8 sizes)
- ✅ Updated `index.html` (with manifest link)
- ✅ Updated `script.js` (with service worker registration)
- ✅ Updated `.htaccess` (with PWA support)

### 3. Test PWA Functionality

1. **Open your site in a browser** (Chrome, Edge, or Safari)
2. **Check Service Worker**:
   - Open DevTools (F12)
   - Go to Application tab
   - Check "Service Workers" section
   - Should show "activated and running"

3. **Test Install Prompt**:
   - Look for install button in header
   - Or use browser's install option (address bar icon)
   - Install the app
   - Verify it appears on home screen

4. **Test Offline Mode**:
   - Open DevTools → Network tab
   - Enable "Offline" mode
   - Refresh page
   - App should still work (cached content)

### 4. HTTPS Requirement

⚠️ **Important**: PWAs require HTTPS in production!

- Service Workers only work over HTTPS
- Localhost is allowed for development
- For production, ensure your site uses HTTPS

## Features Included

### ✅ Offline Support
- Static assets cached for offline use
- API responses cached when possible
- Graceful degradation when offline

### ✅ Install Prompt
- Automatic install button appears when available
- Works on desktop and mobile browsers
- Native app-like experience when installed

### ✅ Update Notifications
- Users notified when new version is available
- Option to reload and update

### ✅ Offline Detection
- Visual notification when going offline/online
- User-friendly messages

## Browser Support

- ✅ Chrome/Edge (Desktop & Mobile)
- ✅ Safari (iOS 11.3+)
- ✅ Firefox (Desktop & Mobile)
- ✅ Samsung Internet
- ⚠️ Opera (Limited support)

## Customization

### Change App Name
Edit `manifest.json`:
```json
{
  "name": "Your App Name",
  "short_name": "Short Name"
}
```

### Change Theme Color
Edit `manifest.json` and `index.html`:
```json
{
  "theme_color": "#your-color"
}
```
Also update the meta tag in `index.html`.

### Modify Cached Files
Edit `service-worker.js`:
```javascript
const STATIC_CACHE_URLS = [
  '/',
  '/index.html',
  // Add your files here
];
```

## Troubleshooting

### Icons Not Showing
- Verify all icon files exist in root directory
- Check file names match exactly (case-sensitive)
- Ensure icons are valid PNG files

### Service Worker Not Registering
- Check browser console for errors
- Verify `service-worker.js` is accessible
- Ensure site is served over HTTPS (or localhost)
- Check `.htaccess` allows service worker files

### Install Button Not Appearing
- Browser may have already installed the app
- Check if app is already in "installed" state
- Some browsers require user interaction first
- Try in incognito/private mode

### Offline Mode Not Working
- Clear browser cache
- Unregister old service worker (DevTools → Application → Service Workers)
- Check service worker is active
- Verify files are in cache list

## Production Checklist

- [ ] All icon files created and uploaded
- [ ] HTTPS enabled
- [ ] Service worker registered successfully
- [ ] Offline mode tested
- [ ] Install prompt working
- [ ] Manifest validated (use Chrome DevTools)
- [ ] Lighthouse PWA audit passed

## Testing with Lighthouse

1. Open Chrome DevTools
2. Go to Lighthouse tab
3. Select "Progressive Web App"
4. Click "Generate report"
5. Fix any issues reported

## Additional Resources

- [MDN: Progressive Web Apps](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps)
- [Web.dev: PWA](https://web.dev/progressive-web-apps/)
- [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)

## Support

If you encounter issues:
1. Check browser console for errors
2. Verify all files are in correct locations
3. Test in different browsers
4. Check HTTPS is enabled (for production)

---

**Note**: The PWA functionality is now fully integrated. Users can install the app and use it offline!
