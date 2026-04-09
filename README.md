![Repository Banner](/assets/banner.png)

[![CI and Quality](https://github.com/jurgenjacobsen/sparrow/actions/workflows/ci-quality.yml/badge.svg)](https://github.com/jurgenjacobsen/sparrow/actions/workflows/ci-quality.yml)
[![wakatime](https://wakatime.com/badge/user/010adc07-6382-419f-87bc-0b3f507ee495/project/fe6a0170-d663-4bd1-9e42-a50021043d0e.svg)](https://wakatime.com/badge/user/010adc07-6382-419f-87bc-0b3f507ee495/project/fe6a0170-d663-4bd1-9e42-a50021043d0e)
![GitHub last commit (branch)](https://img.shields.io/github/last-commit/jurgenjacobsen/water-today/main)
![GitHub top language](https://img.shields.io/github/languages/top/jurgenjacobsen/water-today)
![Chrome Web Store Rating](https://img.shields.io/chrome-web-store/rating/hmghohgdmigjjeghlkjfcfomacleaooh)
![Chrome Web Store Size](https://img.shields.io/chrome-web-store/size/hmghohgdmigjjeghlkjfcfomacleaooh)

# Water Today

Water Today is a Chrome extension that helps you build a hydration habit with timed reminders, quick intake logging, and a clear daily progress view.

## Highlights

- Quick-add water buttons and custom amount input
- Daily intake progress ring with percent tracking
- Configurable daily goal (ml)
- Configurable reminder interval
- Browser badge showing current goal completion percentage
- Optional reminder notification sound
- Option to keep reminders running after you reach your goal
- Automatic daily reset of intake

## Tech Stack

- TypeScript
- Chrome Extensions Manifest V3
- Chrome APIs: alarms, notifications, storage, offscreen

## Project Structure

```text
.
|- manifest.json
|- popup.html
|- offscreen.html
|- src/
|  |- background.ts
|  |- popup.ts
|  \- offscreen.ts
|- scripts/            # compiled JavaScript output from TypeScript
|  |- background.js
|  |- popup.js
|  \- offscreen.js
|- style/
|  \- popup.css
\- assets/
```

## Requirements

- Node.js 18+ (recommended)
- npm
- Google Chrome (or Chromium-based browser supporting MV3)

## Setup

1. Install dependencies:

```bash
npm install
```

2. Build the extension:

```bash
npm run build
```

3. Load in Chrome:

```text
chrome://extensions -> Enable Developer mode -> Load unpacked -> select this folder
```

## Development

Build once:

```bash
npm run build
```

Build in watch mode:

```bash
npm run watch
```

After rebuilding, click "Reload" for the extension on `chrome://extensions`.

## How It Works

- `background.ts` handles reminder alarms, badge updates, and notifications.
- `popup.ts` renders progress UI, handles intake actions, and saves settings.
- `offscreen.ts` plays reminder audio from an offscreen document (MV3-safe approach).
- Daily reset is tracked in local storage via a `lastReset` date key.

## Settings

From the popup settings panel you can configure:

- Reminder interval (minutes)
- Daily goal (ml)
- Notifications on/off
- Sounds on/off
- Keep reminding after goal completion on/off

## Data & Privacy

Water Today stores all data in Chrome sync storage:

- `chrome.storage.sync`: intake amount, daily reset marker, settings, and preferences

No external backend is used.

## Permissions

From `manifest.json`:

- `alarms`: schedule recurring hydration reminders
- `notifications`: show reminder notifications
- `storage`: persist intake and settings
- `offscreen`: play reminder audio in MV3 service worker context

## License

This project is licensed under the GNU Affero General Public License v3.0.
See `LICENSE` for full text.
