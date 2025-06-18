# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Web Helper Chrome Extension - A utility Chrome extension that provides a floating menu with web page productivity features including full-page screenshots and bulk checkbox operations.

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

### Core Features Implementation
1. **Full Page Screenshots**: Use Canvas API or html2canvas library to capture entire page including scrollable content
2. **Bulk Checkbox Operations**: Query all checkboxes via `document.querySelectorAll('input[type="checkbox"]')` and manipulate `checked` property

### Development Approach
Follow the implementation priority outlined in README.md:
1. Basic structure (manifest.json, popup files)
2. Checkbox functionality (simpler DOM operations)
3. Screenshot functionality (complex image processing)
4. UI/UX improvements

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