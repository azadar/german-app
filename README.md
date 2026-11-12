# Deutsch 80/20 (PWA)
Run locally: VS Code + "Live Server" extension -> right-click index.html -> Open with Live Server.
Deploy: push to `main` to run the GitHub Actions workflow in `.github/workflows/pages.yml`. On first setup, confirm that GitHub Pages is enabled with the `GitHub Actions` source under Settings -> Pages. The project site URL is `https://azadar.github.io/german-app/`.
Install on Windows: open the Pages link in Edge -> ... -> Apps -> Install this site as an app.

`words.json` combines `words-ori.json` and the existing vocabulary, removes duplicate German spellings (case-sensitive), and ranks entries using the German OpenSubtitles 2018 frequency list. Multi-word entries are estimated from their least-frequent word, with a 10× penalty for each additional word. Source: [FrequencyWords](https://github.com/hermitdave/FrequencyWords), content licensed CC BY-SA 4.0. Stable `id` values keep word progress attached to the right German entry when frequency sorting changes its position. The list currently has 1,500 entries.

The first 135 curated additions used the ACoLi [DBnary German-English and English-Urdu dictionaries](https://github.com/acoli-repo/acoli-dicts), licensed CC BY-SA 3.0. Because matching translations across two dictionaries can select the wrong sense, their meanings were reviewed/corrected. Later everyday additions were manually curated. Entries with an empty `p` use the app's German speech playback instead of a respelling.

Add words as objects with stable `id`, `de`, `p`, `en`, and `ur` fields, keeping the list in frequency order. `p` may be empty when no learner-friendly pronunciation is available. Increment the cache name in `sw.js` after changing app assets (currently `deutsch-v11`).

`phrases.json` contains 166 curated phrases across common situations. The Speak tab prompts with the English and Urdu meaning before revealing and speaking the German phrase, so practise retrieving and saying the phrase before looking. Phrase progress is saved separately from word progress; it is a practice aid, not a fluency score.

The app logo is a minimal pair of speech bubbles on the app's sky-blue background in `icons/logo.svg`; the matching PNG sizes are used for PWA installation and Apple home-screen icons.

The interface follows the Skylearn design system from [DesignMD](https://designmd.ai/duanhdan/skylearn), downloaded to `.design/DESIGN.md`. It uses Atkinson Hyperlegible body text, high-contrast sky/leaf colors, rounded surfaces, large touch targets, visible keyboard focus, and reduced-motion support. The page structure, styles, and application logic are kept in `index.html`, `styles.css`, and `app.js`, respectively.
