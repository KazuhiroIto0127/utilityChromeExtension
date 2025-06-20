# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Web Helper Chrome Extension - A utility Chrome extension that provides a floating menu with web page productivity features including full-page screenshots, visible area screenshots, and bulk checkbox operations.

## Architecture

This is a Chrome Extension (Manifest V3) project with the following structure:
- **manifest.json**: Extension configuration and permissions
- **popup.html/css/js**: Floating menu interface triggered by extension icon
- **content.js**: Script injected into web pages to perform DOM operations
- **background.js**: Background service worker for extension lifecycle
- **icons/**: Extension icons (16px, 48px, 128px)

## Key Technical Requirements

### Permissions Required
- `activeTab`: Execute scripts in current tab
- `scripting`: Inject content scripts
- `downloads`: Download screenshot files
- `debugger`: Chrome DevTools Protocol access for full-page screenshots

### Core Features Implementation
1. **Full Page Screenshots**: Use Chrome DevTools Protocol (`Page.captureScreenshot`) for high-quality capture of entire page including scrollable content
2. **Visible Area Screenshots**: Use Chrome Tabs API (`chrome.tabs.captureVisibleTab`) for fast capture of currently visible browser area
3. **Bulk Checkbox Operations**: Query all checkboxes via `document.querySelectorAll('input[type="checkbox"]')` and manipulate `checked` property

### Development Approach
Follow the implementation priority outlined in README.md:
1. Basic structure (manifest.json, popup files)
2. Checkbox functionality (simpler DOM operations)
3. Screenshot functionality (both full-page and visible area)
4. UI/UX improvements

### Screenshot Implementation Details
- **Full Page**: Uses Chrome DevTools Protocol with conditional optimization (one-shot for small pages, tiled capture for large pages >16384px)
- **Visible Area**: Uses standard Chrome Tabs API for immediate capture of current viewport
- Both functions automatically download captured images with timestamped filenames

## Security & Compatibility
- Must comply with Content Security Policy (CSP)
- Chrome Manifest V3 compliance required
- Proper error handling for screenshot failures and missing checkboxes
- Performance optimization for large pages

## Development Commands

Since this is a Chrome extension project, development typically involves:
- Loading the extension in Chrome Developer Mode for testing
- No build process required for basic extensions (unless using TypeScript or bundlers)
- Test by loading unpacked extension from chrome://extensions/