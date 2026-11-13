PADHAI SAATHI — STATIC PRODUCT WEBSITE

This informational website introduces the Padhai Saathi Windows focus app. It has no checkout, payment provider, account sign-in, password collection, analytics, or customer form.

LOCAL PREVIEW
1. Open PowerShell in this website folder.
2. Run: py -m http.server 8080
3. Open: http://localhost:8080
4. Stop the local server with Ctrl+C.

The site uses plain HTML, CSS, and JavaScript. It has no build step or package installation. System fonts are available as a fallback if Google Fonts cannot load.

FILES
- index.html: content, navigation, app illustration, focus timer preview, FAQ, and SEO metadata
- styles.css: responsive layout, visual theme, and motion preferences
- script.js: mobile navigation, reveal effects, six selectable timer previews, start/pause, and reset
- assets/PadhaiSaathi.svg: app mark and favicon
- .nojekyll: serves static files directly on GitHub Pages
- robots.txt and sitemap.xml: search crawler instructions and sitemap

GITHUB PAGES
Publish from the main branch root. There is no build command. The public page describes the app only; it does not accept payments or collect account credentials.

The product mockup is an illustration of the app experience, not a live app window. Product details follow the current Padhai Saathi v4 feature set, including a YouTube channel allowlist that can keep selected study channels available during focus.
