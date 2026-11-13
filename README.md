# Deutsch 80/20

Deutsch 80/20 is a progressive web app for practising useful everyday German with English and Urdu support. It focuses on building vocabulary and confidence in real conversations rather than perfect grammar.

**Use the app:** [azadar.github.io/german-app](https://azadar.github.io/german-app/)

## Features

- Learn a daily set of frequently used words, choose random new words, or review learned words.
- Search and filter 1,500 vocabulary entries, listen to German pronunciation, and practise saying words.
- Practise 166 phrases by situation: recall the German from its meaning, then reveal and listen.
- Review vocabulary with flashcards.
- Track word progress, practice phrases, and a daily streak in the browser. Progress is stored locally on the device and is not synced between devices.
- Adjust voice speed or mute speech. Pronunciation prefers the natural (online) German Katja voice when the browser provides one (for example, in Edge), then any natural German voice; otherwise it uses the first available German voice or the browser default. Speech recognition depends on browser support and microphone permission.
- Use a responsive interface with light and dark colors, keyboard focus indicators, reduced-motion and forced-colors support.

## Run and install

To run locally, open the project in VS Code, install the **Live Server** extension, and select **Open with Live Server** on `index.html`. The app needs to be served over HTTP to load its data files.

To install on Windows, open the [app](https://azadar.github.io/german-app/) in Edge and select **… > Apps > Install this site as an app**. The service worker caches app assets for offline use after they have been loaded.

## Deploy

Push to `main` to deploy the static site through the GitHub Actions workflow in `.github/workflows/pages.yml`. The repository's GitHub Pages source must be set to **GitHub Actions**. The published app and its vocabulary and phrase data are publicly accessible.

## Vocabulary and phrases

`words.json` contains deduplicated German entries ranked using the German OpenSubtitles 2018 frequency list. Duplicate spellings are checked case-sensitively. Multi-word entries are estimated from their least-frequent word, with a 10× penalty for each additional word. Source: [FrequencyWords](https://github.com/hermitdave/FrequencyWords), content licensed CC BY-SA 4.0.

The first 135 curated additions used the ACoLi [DBnary German-English and English-Urdu dictionaries](https://github.com/acoli-repo/acoli-dicts), licensed CC BY-SA 3.0. Their meanings were reviewed and corrected because matching translations across dictionaries can select the wrong sense. Later everyday additions were manually curated.

Add words as objects with stable `id`, `de`, `p`, `en`, and `ur` fields, keeping the list in frequency order. `p` may be empty when no learner-friendly respelling is available; learners can still use German speech playback. Word progress is keyed by German headword, so changing a headword can affect saved progress.

`phrases.json` contains curated phrases across common situations. Phrase progress is saved separately from word progress; it is a practice aid, not a fluency score.

## Project structure

- `index.html`, `styles.css`, and `app.js`: page structure, styles, and application logic.
- `words.json` and `phrases.json`: learning content.
- `manifest.json`, `sw.js`, and `icons/`: installation metadata, offline caching, and app icons.
- `.design/DESIGN.md`: the [Skylearn design system](https://designmd.ai/duanhdan/skylearn) reference.

Increment the cache name in `sw.js` after changing app assets (currently `deutsch-v17`). Installed apps show an "Update now" prompt when a new cache version is deployed.
