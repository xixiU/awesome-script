# Twitter Block All Commenters

[中文文档](README_zh.md) | English

A Tampermonkey userscript to block all commenters under a specific tweet on Twitter/X with one click.

## Features

- 🎯 Block all commenters under a tweet with one click
- 🔄 Automatically scroll and load all comments
- 📊 Real-time progress display
- ✅ Statistics on successful and failed operations
- 🎨 Beautiful floating button interface
- 🌐 Multi-language support (English/Chinese) - Auto-detects system language

## Installation

### 1. Install Tampermonkey Extension

First, install the Tampermonkey extension in your browser:

- **Chrome/Edge**: [Chrome Web Store](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
- **Firefox**: [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/tampermonkey/)
- **Safari**: [Mac App Store](https://apps.apple.com/app/tampermonkey/id1482490089)

### 2. Install the Script

After installing Tampermonkey:

1. Click the Tampermonkey icon in your browser toolbar
2. Select "Create a new script"
3. Copy and paste the entire code from `twitter_block_commenters.user.js` into the editor
4. Press `Ctrl + S` (Mac: `Cmd + S`) to save

## Usage

### 1. Open a Tweet Detail Page

Navigate to any tweet's detail page on Twitter/X (URL format: `https://x.com/username/status/tweetID`)

### 2. Click the Block Button

A purple gradient floating button **"🚫 屏蔽所有评论者"** (Block All Commenters) will appear in the top right corner of the page

### 3. Confirm the Action

After clicking the button, a confirmation dialog will appear. Once confirmed, the script will:

1. Automatically scroll to load all comments
2. Extract all commenters' usernames
3. Block each commenter one by one
4. Display real-time progress

### 4. Complete

After completion, a statistics dialog will show:

- Number of successful blocks
- Number of failed blocks
- Total number of users

## Configuration

Click the Tampermonkey icon → Script settings → ⚙️ Open TwitterBlockCommenters configuration to access settings:

- **Exclude Original Poster**: Do not block the person who posted the tweet (default: enabled)
- **Max Scroll Attempts**: Maximum number of scroll attempts to load all comments (default: 3, range: 1-20)

## Important Notes

⚠️ **Warning**:

1. **Irreversible**: Once blocked, you need to manually unblock users in settings
2. **Rate Limiting**: The script has built-in delays (2 seconds between each user) to avoid triggering Twitter's rate limits
3. **Detail Page Only**: Must be used on tweet detail pages, not on timeline pages
4. **Login Required**: You must be logged into your Twitter account
5. **Use Carefully**: Only use when truly necessary to avoid blocking innocent users

## How It Works

1. **Comment Loading**: Automatically scrolls the page to trigger Twitter's lazy loading mechanism and load more comments
2. **User Identification**: Parses the page DOM structure to extract all commenters' usernames
3. **UI Automation**: Simulates user click operations (click "⋯" menu → click "Block" → confirm block)
4. **Progress Feedback**: Real-time button status updates showing processing progress

## Tech Stack

- Vanilla JavaScript
- Tampermonkey GM API
- DOM Manipulation
- MutationObserver (for route change detection)

## FAQ

### Q: Why do some blocks fail?

A: Possible reasons:

- User is already blocked
- User account has been deleted or suspended
- Network latency causing page elements not to load completely
- Twitter page structure has changed

### Q: Can I bulk unblock users?

A: The script currently only supports blocking. To unblock:

1. Go to Settings → Privacy and Safety → Blocked Accounts
2. Manually unblock each user one by one

### Q: Will this get my account banned?

A: The script has built-in reasonable delays and simulates real user operations. Normal use will not lead to a ban. However:

- Don't use it frequently
- Don't block a large number of users in a short time
- Follow Twitter's Terms of Service

### Q: Does it work on mobile?

A: The script is designed for desktop browsers. Mobile browsers typically don't support userscript extensions like Tampermonkey.

## Changelog

### v1.4 (2026-02-01)

- ✨ Added configurable max scroll attempts (default: 3, adjustable from 1-20)
- 🔧 Optimized comment loading performance with customizable scroll behavior

### v1.3 (2026-02-01)

- ✨ Added configuration option to exclude original poster (default: enabled)
- 🔧 Integrated with ConfigManager for settings management
- 🌐 Multi-language support (English/Chinese) with auto-detection
- 🎯 One-click blocking of all commenters under a tweet
- 🔄 Auto-loads all comments and displays real-time progress
- 🎨 Beautiful UI with floating button interface

## License

MIT License

## Author

xixiU

## Contributing

Issues and Pull Requests are welcome!

## Disclaimer

This script is for educational and communication purposes only. Users are responsible for any consequences arising from the use of this script. The author is not responsible for any losses caused by using this script.

