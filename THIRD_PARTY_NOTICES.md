# Third-party notices

petty: Reader is licensed under AGPL-3.0-only. It bundles the following projects, unmodified, under `extension/vendor/`. Run `npm run vendor` to refresh them from `node_modules`.

| Project | Used for | License | Location |
|---|---|---|---|
| [Readability](https://github.com/mozilla/readability) by Mozilla, © 2010 Arc90 Inc | Finding the article on a page | Apache-2.0 | `extension/vendor/readability/` |
| [PDF.js](https://github.com/mozilla/pdf.js) by Mozilla | Reading text and links from PDFs | Apache-2.0 | `extension/vendor/pdfjs/` |
| [Literata](https://github.com/googlefonts/literata) | Book typeface | OFL-1.1 | `extension/vendor/fonts/` |
| [EB Garamond](https://github.com/octaviopardo/EBGaramond12) | Book and cover typeface | OFL-1.1 | `extension/vendor/fonts/` |
| [Lora](https://github.com/cyrealtype/Lora-Cyrillic) | Book typeface | OFL-1.1 | `extension/vendor/fonts/` |
| [Atkinson Hyperlegible Next](https://github.com/googlefonts/atkinson-hyperlegible-next) | Book typeface | OFL-1.1 | `extension/vendor/fonts/` |

The font files come from the [Fontsource](https://fontsource.org) packages (latin and latin-ext subsets). Each project's full license text sits next to its files.

All sounds (ambience, page turns, coffee) are synthesized in `extension/reader/audio.js`. There are no audio files.

The README screenshots use Henry David Thoreau's essay "Walking" from [Project Gutenberg](https://www.gutenberg.org/ebooks/1022), which is in the public domain in the United States. The record player screenshot shows [Big Buck Bunny](https://peach.blender.org/), © Blender Foundation, licensed [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).
