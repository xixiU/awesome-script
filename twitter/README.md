# Twitter X Toolkit

[中文文档](README_zh.md) | English

A powerful multi-functional toolkit for Twitter/X, integrating commenter blocking, AI-powered summarization, and more features to come.

## Features

### 🚫 Block All Commenters

- 🎯 Block all commenters under a tweet with one click
- 🔄 Automatically scroll and load all comments
- 📊 Real-time progress display
- ✅ Statistics on successful and failed operations
- ⚙️ Configurable option to exclude original poster

### 🤖 AI-Powered Summarization

- 📝 **Tweet Detail Page**: Summarize tweet content and comments, analyze comment sentiment and discussion hotspots
- 👤 **User Profile Page**: Summarize user's tweets, analyze topics and speaking style
- 🌐 Support custom OpenAI-compatible APIs (OpenAI, Azure, self-hosted, etc.)
- 📊 Configurable max pages to load
- 🎨 Beautiful result panel with fullscreen and copy features

### 🌍 General Features

- 🌐 Multi-language support (English/Chinese) - Auto-detects system language
- 🎨 Beautiful floating button interface
- ⚙️ Rich configuration options

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
3. Copy and paste the entire code from `twitter_x_toolkit.user.js` into the editor
4. Press `Ctrl + S` (Mac: `Cmd + S`) to save

## Usage

### Feature 1: Block Commenters

#### 1. Open a Tweet Detail Page

Navigate to any tweet's detail page on Twitter/X (URL format: `https://x.com/username/status/tweetID`)

#### 2. Click the Block Button

A purple gradient floating button **"🚫 Block All Commenters"** will appear in the top right corner

#### 3. Confirm and Execute

After clicking and confirming, the script will:

1. Automatically scroll to load all comments
2. Extract all commenters' usernames
3. Block each commenter one by one
4. Display real-time progress and statistics

### Feature 2: AI Summarization

#### 1. Configure AI API (First Time Use)

Click Tampermonkey icon → Script Settings → ⚙️ Open TwitterXToolkit Configuration, and set:

- **OpenAI API Base URL**: API base URL (e.g., `https://api.openai.com/v1`)
- **API Key**: Your OpenAI API Key
- **AI Model**: Model name (e.g., `gpt-3.5-turbo`, `gpt-4`)
- **Max Scroll Attempts**: Control how many times to scroll for loading content (default: 10, range: 1-50)

#### 2. Use AI Summarization

**On Tweet Detail Page**:

- Click the pink gradient **"🤖 AI Summary"** button
- The script will auto-load the tweet and comments, then generate a summary
- Summary includes: core viewpoints of original tweet, comment sentiment distribution, discussion hotspots, overall public opinion

**On User Profile Page**:

- Click the **"🤖 AI Summary"** button
- The script will load user's tweets and generate a summary
- Summary includes: main topics of interest, speaking style, core viewpoints, recent active themes

#### 3. View and Operate Results

After summarization completes, a result panel will appear, supporting:

- 📄 **Copy**: One-click copy of summary content
- 🖥️ **Fullscreen**: View summary in fullscreen mode
- ❌ **Close**: Close the result panel

## Configuration Options

Click Tampermonkey icon → Script Settings → ⚙️ Open TwitterXToolkit Configuration:

### General Configuration

- **Exclude Original Poster**: Don't block the person who posted the tweet (default: enabled)
- **Max Scroll Attempts**: Maximum scroll attempts for loading content, used for both blocking and AI summarization (default: 10, range: 1-50)

### AI Summarization Configuration

- **OpenAI API Base URL**: OpenAI-compatible API base URL (default: `https://api.openai.com/v1`)
- **API Key**: Your OpenAI API Key (required)
- **AI Model**: Model name to use (default: `gpt-3.5-turbo`)

## Important Notes

⚠️ **Important**:

### Block Feature

1. **Irreversible**: After blocking is complete, you need to manually unblock users in settings
2. **Rate Limiting**: Built-in delay (1 second between each user) to avoid triggering Twitter's rate limits
3. **Detail Page Only**: Block feature only works on tweet detail pages
4. **Use With Caution**: Recommended to use only when truly needed to avoid blocking innocent users

### AI Summarization Feature

1. **API Key Security**: Keep your API Key safe and don't share it with others
2. **API Costs**: Using OpenAI API will incur costs, please monitor your usage
3. **Compatibility**: Supports all OpenAI-compatible API services (Azure OpenAI, self-hosted models, etc.)
4. **Loading Time**: Depending on content volume and network conditions, summarization may take 10-60 seconds
5. **Login Required**: Need to be logged into Twitter to view content

## How It Works

### Block Feature

1. **Comment Loading**: Automatically scrolls the page to trigger Twitter's lazy loading mechanism
2. **User Identification**: Parses DOM structure to extract all commenters' usernames
3. **UI Operation**: Simulates user clicks (click "..." menu → click "Block" → confirm block)
4. **Progress Feedback**: Real-time button status updates showing progress

### AI Summarization Feature

1. **Page Type Detection**: Automatically identifies current page type (tweet detail / user profile)
2. **Content Extraction**:
   - Tweet Detail Page: Extract original tweet content + auto-scroll to load comments
   - User Profile Page: Auto-scroll to load user's tweets
3. **Content Organization**: Format extracted content into structured data
4. **API Call**: Call OpenAI-compatible API for intelligent summarization
5. **Result Display**: Display Markdown-formatted summary results in a beautiful panel

## Tech Stack

- Vanilla JavaScript
- Tampermonkey GM API
  - `GM_setValue` / `GM_getValue`: Persistent config storage
  - `GM_xmlhttpRequest`: Cross-origin API calls
  - `GM_addStyle`: Inject styles
  - `GM_registerMenuCommand`: Register menu commands
- DOM Manipulation
- MutationObserver (listen for route changes)
- OpenAI API (supports various compatible AI services through proxy)

## FAQ

### Block Feature Related

#### Q: Why do some users fail to block?

A: Possible reasons:

- User is already blocked
- User account has been deleted or suspended
- Network latency caused page elements not to load completely
- Twitter page structure has changed

#### Q: Can I batch unblock users?

A: The script currently only supports blocking. To unblock:

1. Go to Settings → Privacy and safety → Blocked accounts
2. Manually unblock each user

#### Q: Will I get banned by Twitter?

A: The script has built-in reasonable delay mechanisms, simulating real user operations. Normal use won't lead to banning. However:

- Don't use too frequently
- Don't block large numbers of users in a short time
- Follow Twitter's Terms of Service

#### Q: Does it support mobile?

A: The script is designed for desktop browsers. Mobile browsers typically don't support Tampermonkey.

### AI Summarization Related

#### Q: Which AI services are supported?

A: Supports all OpenAI-compatible API services, including:

- Official OpenAI API (`https://api.openai.com/v1`)
- Azure OpenAI Service
- Domestic API proxy services
- Self-hosted compatible models (e.g., LocalAI, vLLM, etc.)

Just configure the correct API URL and key.

#### Q: Why does summarization fail or timeout?

A: Possible reasons:

- API key not configured or expired
- Incorrect API URL configuration
- Network connection issues
- API service temporarily unavailable
- Request timeout (default 60 seconds)

#### Q: How to save on API costs?

A: Suggestions:

- Use `gpt-3.5-turbo` instead of `gpt-4` (about 10x cheaper)
- Reduce "Max Scroll Attempts" configuration (default 3, loads less content)
- Only use summarization when needed
- Consider using self-hosted models

#### Q: What language is the summary in?

A: Regardless of the original language, summaries are output in **Chinese** using structured Markdown format for easy reading.

#### Q: Can I customize the summary prompts?

A: The current version doesn't support custom prompts and uses built-in optimized prompts. This feature may be added in future versions.

## Changelog

### v2.1 (2026-02-09)

- 🔧 **Optimized Default Config**: Increased default max scroll attempts from 3 to 10 for more content
- 🎨 **Comprehensive Panel Optimization**:
  - Fixed content area scrolling issue
  - Fullscreen mode now utilizes entire screen space
  - Unified button style with circular icon buttons (⛶ 📋 ×)
  - Enhanced hover effects and interaction feedback
- 📦 **Code Refactoring**: Abstracted generic scroll loading function, reducing 150+ lines of duplicate code
- ⚡ **Performance Boost**: Optimized content extraction logic, improved code maintainability

### v2.0.2 (2026-02-09)

- 🔧 Optimized configuration: Merged "Max Scroll Attempts" and "Max Pages to Fetch" into a unified config
- 📊 Unified scroll behavior: Blocking and AI summarization share the same configuration
- ⚡ Simplified config panel: Reduced redundant settings, improved UX
- 🔢 Extended config range: Max scroll attempts expanded from 1-20 to 1-50

### v2.0.1 (2026-02-09)

- 🎨 Optimized AI summary result panel: Adapted to Twitter dark mode
- 🔧 Improved Markdown rendering: Auto-clean code block markers, optimized styles
- 📝 Renamed to "Twitter X Toolkit" for multi-functional positioning and future expansion
- 🌈 Enhanced color scheme: Dark background, highlighted text, better readability

### v2.0 (2026-02-09)

- 🚀 **Major Update**: Added AI-powered summarization feature
- 🤖 Support summarizing tweets and comments (tweet detail page)
- 👤 Support summarizing user tweets (user profile page)
- 🌐 Support all OpenAI-compatible API services
- 📊 Configurable max pages to load
- 🎨 Beautiful result panel with fullscreen and copy features
- ⚙️ Updated config manager with more configuration options

### v1.4 (2026-02-01)

- ✨ Added configurable max scroll attempts (default: 3, adjustable from 1-20)
- 🔧 Optimized comment loading performance with customizable scroll behavior

### v1.3 (2026-02-01)

- ✨ Added configuration: Exclude Original Poster (default: enabled, don't block tweet author)
- 🔧 Integrated ConfigManager for configuration management
- 🌐 Multi-language support (English/Chinese), auto-detect system language
- 🎯 One-click block all commenters under a tweet
- 🔄 Auto-load all comments with real-time progress display
- 🎨 Beautiful floating button interface

## License

MIT License

## Author

xixiU

## Support

If you encounter any issues or have suggestions, please:

1. Check the FAQ section above
2. Submit an issue on GitHub
3. Contact the author
