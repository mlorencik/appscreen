# App Store Screenshot Generator

A free, open-source tool for creating beautiful App Store screenshots with customizable backgrounds, text overlays, and 3D device mockups.


**[Start using it now. Hosted on GitHub Pages](https://yuzu-hub.github.io/appscreen/)**

![App Store Screenshot Generator](img/screenshot-generator.png)

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> 🍋 **Built by [YuzuHub](https://yuzuhub.com)** — We build smart AI products in Düsseldorf, Germany. Check out [yuzu.chat](https://yuzu.chat), [Eno](https://eno.yuzuhub.com), [VoltPlan](https://voltplan.app) and more.

## Features

### Output & Export
- **Multiple Output Sizes**: iPhone 6.9", 6.7", 6.5", 5.5" and iPad 12.9", 11" App Store requirements, Android phone/tablet, Google Play Feature Graphic, Open Graph, Twitter/X Card, Website Hero, Landing Page formats, plus custom sizes
- **Per-Screenshot Output Format**: Each screenshot can target a different device — mixed-format exports are grouped into per-format folders inside the ZIP
- **Batch Export**: Export all screenshots at once as a ZIP, organized by `language/format/`
- **Sequential Filenames**: Exports are named `screen_01.png`, `screen_02.png`, … matching the screenshot order, so store uploads keep their sequence
- **Per-Screenshot Settings**: Each screenshot can have its own background, device settings, and text

### Backgrounds
- **Gradient Backgrounds**: Multi-stop gradients with draggable color stops and angle control
- **Preset Gradients**: Quick-access gradient presets for common styles
- **Solid Color**: Simple single-color backgrounds
- **Image Backgrounds**: Upload custom images with blur, overlay, and fit options
- **Noise Overlay**: Add subtle noise texture to any background

### Device Mockups
- **2D Mode**: Position, scale, rotate, and adjust corner radius of screenshots
- **3D Mode**: Interactive iPhone 15 Pro Max and Samsung Galaxy S25 Ultra 3D mockups with drag-to-rotate and rounded-corner inset controls
- **Position Presets**: Centered, bleed, tilt left/right, perspective, and more
- **Shadow Effects**: Customizable drop shadows with color, blur, opacity, and offset
- **Border Effects**: Add borders around screenshots with adjustable width and opacity
- **Graphic Elements & Popouts**: Overlay badges, shapes, and cropped screenshot popouts — with optional card backgrounds behind transparent elements

### Text Overlays
- **Headlines & Subheadlines**: Separate controls with enable/disable toggles
- **Font Picker**: Access to 1500+ Google Fonts with search and preview
- **Text Styling**: Font weight, italic, underline, strikethrough options
- **Positioning**: Top, center, or bottom placement with offset control
- **Line Height**: Adjustable spacing for multi-line text
- **Magical Titles**: AI-generated headline suggestions via your configured provider

### Multi-Language Support
- **Multiple Languages**: Add translations for any language
- **Language Flags**: Visual language switcher with flag icons
- **AI-Powered Translation**: Auto-translate using Claude, OpenAI, or Google AI
- **Per-Screenshot Languages**: Different text per screenshot if needed
- **Localized Screenshots**: Upload language-specific screenshot images with auto-detection from filename
- **Smart Duplicate Detection**: Dialog to replace, create new, or skip when uploading matching screenshots
- **Multi-Language Export**: Export current language only or all languages in separate folders

### Project Management
- **Multiple Projects**: Create, rename, and delete projects
- **Project Backup**: Export/import full projects as portable backup files
- **Auto-Save**: All changes saved automatically to browser storage
- **Screenshot Count**: See screenshot counts in project selector

### Auto-Capture (Playwright)
- **Live Page Capture**: `tools/capture-server.js` captures real, authenticated app pages into localized screenshots — no manual screenshots needed
- **Auth Profiles**: Saved login states (headless scripted login via `tools/accounts.json`, or a headed window for manual login)
- **Scenario Catalog**: `tools/scenarios.json` (gitignored) drives the Scenario picker — each scenario fills the URL and scripted steps (`goto`, `click`, `fill`, `eval`, `apiFetch`, `evalFile`) to reach populated screen states
- **Robust Capture**: Navigation retries, content-settle and skeleton-loader waits, blank/gray screenshot detection, automatic retry of timed-out locales, and manual retry that merges results into the same screenshot
- **Per-Language Retake**: Re-capture a single language into an existing screenshot without rerunning the batch

### User Interface
- **Dark Theme**: Easy on the eyes for extended editing sessions
- **Side Preview Carousel**: See adjacent screenshots while editing, with sliding transitions
- **Drag & Drop**: Reorder screenshots by dragging, or drag the canvas to navigate between screens
- **Zoom & Pan Toolbar**: Zoom into the preview and pan around the canvas
- **Precise Sliders**: `−`/`+` step buttons next to every slider for exact values, plus one-click reset
- **Collapsible Sections**: Clean UI with expandable settings panels
- **Tab Persistence**: Remembers your active tab between sessions
- **Performance-Optimized**: Cached side previews, debounced saves, and lazy image decoding keep the editor fast even with many screenshots and languages

## Getting Started

### Just Want to Use It?

Visit **[yuzu-hub.github.io/appscreen](https://yuzu-hub.github.io/appscreen/)** to use the tool directly in your browser. No installation needed!

---

### Want to Develop & Customize?

#### Option 1: With Claude Desktop (Easiest - No Technical Knowledge Required)

Perfect for non-technical users who want to run and modify the tool locally with AI assistance:

1. **Install GitHub Desktop**
   - Download from [desktop.github.com](https://desktop.github.com)
   - Install and sign in with your GitHub account

2. **Clone this repository**
   - Click the green "Code" button above → "Open with GitHub Desktop"
   - Choose where to save it (e.g., Documents folder)

3. **Install Claude Desktop**
   - Download from [claude.ai/download](https://claude.ai/download)
   - Sign in with your Anthropic account

4. **Open in Claude Desktop**
   - Open Claude Desktop app
   - Click the "Code" tab at the top
   - Click "Open Folder" and select the cloned repository folder

5. **Start the app**
   - Simply type: **"start the app"**
   - Claude will automatically start the server and tell you which URL to open in your browser
   - Claude monitors the server and reports any issues

6. **Make changes**
   - Ask Claude to modify features, fix bugs, or add functionality
   - Claude will show you the proposed commit message before committing
   - All changes are automatically saved to Git

No command line, no technical setup - just chat with Claude!

#### Option 2: Run Locally (Command Line)

Since this app uses IndexedDB for persistence, you need to serve it through a local web server:

```bash
# Using Python
cd appscreen
python3 -m http.server 8000

# Using Node.js
npx serve .
```

Then open `http://localhost:8000` in your browser.

#### Option 3: VS Code Live Server

If you have the "Live Server" extension installed in VS Code, right-click `index.html` and select "Open with Live Server".

#### Option 4: Docker

Run the pre-built Docker image from GitHub Container Registry:

```bash
# Using Docker directly
docker run -d -p 8080:80 ghcr.io/yuzu-hub/appscreen:latest

# Using Docker Compose
docker compose up -d
```

Then open `http://localhost:8080` in your browser.

#### Building locally

If you want to build the image yourself:

```bash
docker compose -f docker-compose.build.yml up -d
```

## Usage

1. **Upload Screenshots**: Drag and drop your app screenshots or click to browse
2. **Choose Output Size**: Select the target device size from the sidebar
3. **Customize Background**: Choose gradient, solid color, or image background
4. **Position Screenshot**: Use presets or manually adjust scale, position, and rotation
5. **Switch to 3D** (optional): Enable 3D mode for interactive iPhone mockup
6. **Add Text**: Enter your headline and optional subheadline
7. **Export**: Download the current screenshot or export all at once as ZIP

## AI Translation

To use the AI-powered translation feature:

1. Click the Settings icon (gear) in the sidebar
2. Choose your AI provider (Claude, OpenAI, or Google)
3. Enter your API key from the respective provider's console
4. Add multiple languages to your headline/subheadline
5. Click the translate icon and use "Auto-translate with AI"

Your API key is stored locally in your browser and only sent to the respective AI provider's API.

## Auto-Capture

The bundled Playwright server captures real app pages into localized screenshots:

```bash
node tools/capture-server.js   # or start-capture.bat
```

1. Create `tools/accounts.json` from `tools/accounts.example.json` with your credentials (gitignored, never committed)
2. In the app, click **Auto-capture**, log in once to save an auth profile, then pick a scenario or enter a custom URL
3. Capture runs across all project languages — results land as per-language screenshot images
4. Failed locales can be retried and merged into the same screenshot

## Tech Stack

- Vanilla JavaScript (no frameworks)
- HTML5 Canvas for 2D rendering
- Three.js for 3D device mockups
- IndexedDB for local storage
- JSZip for batch export
- Google Fonts API for font picker
- Claude/OpenAI/Google APIs for translations
- Playwright for automated live-page capture
- Docker + nginx for containerized deployment

## Apps Using This Project

Built something with this tool? Add your app to the list by submitting a pull request!

| App | Description | Link |
|-----|-------------|------|
| Cable | Manage your 12V systems like Boats and RVs | [cable.yuzuhub.com](https://cable.yuzuhub.com) |
| Eno | Wine pairings and food pairings made easy | [eno.yuzuhub.com](https://eno.yuzuhub.com) |
| TravelRates Currency Converter* | Exchange Rates for Travelers | [apple.com](https://apps.apple.com/sg/app/travelrates-currency-converter/id6756080378) |
| Trakz Sales Tracker | Manage sales for restaurants and small businesses | [apple.com](https://apps.apple.com/us/app/trakz-sales-tracker/id6748954468) |
| AI Soccer Insights Football IQ | AI-powered football predictions and insights | [apple.com](https://apps.apple.com/us/app/ai-soccer-insights-football-iq/id6592649804) |
| Navegatime | time tracking for workers and business functions | [play.google.com](https://play.google.com/store/apps/details?id=com.companyname.NavegaTime) |
| Sommo | Your personal wine journey — scan labels, learn wine, and build your tasting journal | [sommo.app](https://sommo.app) |
| Dandelion: Write and Let Go | An ephemeral journal for writing to let go, not save. | [apple.com](https://apps.apple.com/us/app/dandelion-write-and-let-go/id6757363901) |
| *Your app here* | *Submit a PR to add your app* | *Your app link* |

## License

MIT License - feel free to use, modify, and distribute.

## Credits
- **Samsung Galaxy S25 Ultra 3D Model** by [mistJS](https://sketchfab.com/mistjs) - Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

- **iPhone 15 Pro Max 3D Model** by [MajdyModels](https://sketchfab.com/majdymodels) - Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

## Author

Proudly vibe coded by [Stefan](https://github.com/BlackMac) at [YuzuHub](https://yuzuhub.com/en) — building smart AI products from Düsseldorf, Germany.
