# Translight · 빛번역
[![CI](https://github.com/neverworkalone/translight/actions/workflows/ci.yml/badge.svg)](https://github.com/neverworkalone/translight/actions/workflows/ci.yml)
[![pages-build-deployment](https://github.com/neverworkalone/translight/actions/workflows/pages/pages-build-deployment/badge.svg?branch=master)](https://github.com/neverworkalone/translight/actions/workflows/pages/pages-build-deployment)

A Chrome extension for translating English webpages into Korean with Chrome's built-in Translator API while preserving the original text.

## Features

- Translate English webpages into Korean with Chrome's built-in Translator API
- Start, cancel, and stop translation from the toolbar
- Choose original + translation, translation + original, or translation-only display
- Translate page titles, paragraphs, lists, quotes, captions, and table cells
- Detect English content blocks even when a site's UI language is Korean
- Prioritize visible content on long pages and handle dynamically changing pages
- Continue manual translation across same-origin navigation
- Automatically translate registered hostnames
- Customize 10 translation display styles, colors, bold, and italic text
- View translation model status and download progress
- Export, import, and reset settings
- Skip translation when a page is already in the target language
- Require an explicit English declaration or a conservative English signal for undeclared Latin text
- Leave code, preformatted text, and form controls unchanged
- Remove only the nodes, attributes, and styles added by Translight when translation is stopped

## Install

Install the extension from the [Chrome Web Store](https://chromewebstore.google.com/detail/translight-·-빛번역/jhlbnaobbadaagnonlaklpelbaakidll).

## Help

See the [Help page](https://neverworkalone.github.io/translight/) for setup instructions and usage details.

## Tech Stack

- Vue 3
- Vite
- Chrome Extension Manifest V3
- Chrome built-in Translator API

## Development

### Install dependencies

```bash
npm install
```

### Build the extension

```bash
npm run build
```

### Run tests and checks

```bash
npm run check
```

### Create a release package

```bash
npm run package
```

### For a readable debug package without JavaScript or CSS minification:

```bash
./pack.sh
```


### Run the development server

```bash
npm run dev
```

The Translator API and its language model run in Chrome's supported desktop environments. The first translation may require downloading the on-device model. Translight does not send page content to an external translation server.

Translight translates English into Korean. It respects an applicable `lang="en"` declaration, while undeclared Latin text must contain a conservative English lexical signal before it is sent to Chrome Translator. Undeclared text without that signal is left unchanged instead of being guessed as English; this avoids passing Spanish, French, German, and other Latin-script languages to the provider's English source-language model.
