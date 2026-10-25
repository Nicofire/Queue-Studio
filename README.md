# Stable Diffusion Queue Manager Webapp

## Overview

This project is the new frontend for the Stable Diffusion Queue Manager. It is being rewritten as a React + Vite + TypeScript web app so the old Python GUI can be replaced with a modern browser-based interface.

The long-term goal is to keep the queue-management logic, template workflow, and generation controls from the original desktop app, but present them through a cleaner and more maintainable web UI.

## Current Status

The project currently contains a minimal starter page. It serves as the first foundation for the new UI and replaces the default Vite demo screen.

Planned areas for the web app include:

- queue management for Stable Diffusion generations
- template browsing and editing
- prompt and seed controls
- model and preset management
- progress tracking and ETA display
- workspace state persistence

## Original Desktop App

The previous Python implementation is preserved in `old_queue_manager_python/Stable-Diffusion-Queue-Manager/` for reference.

That version included:

- queue control with start, pause, and abort actions
- template system for characters, objects, scenes, and animals
- metadata-aware image import
- model presets and prompt presets
- UI state saving
- keyboard shortcuts for faster workflow

## Tech Stack

- React 19
- Vite
- TypeScript
- ESLint

## Setup

### Prerequisites

- Node.js 18 or newer
- npm
- A modern browser

If you want to connect the frontend to Stable Diffusion later, you will also need a local AUTOMATIC1111 WebUI instance.

### Install

```bash
npm install
```

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Lint

```bash
npm run lint
```

### Preview Production Build

```bash
npm run preview
```

## Project Structure

```text
queue-manager/
├── public/
├── src/
│   ├── App.tsx
│   ├── App.css
│   ├── index.css
│   └── main.tsx
├── index.html
├── package.json
└── vite.config.ts
```

## Next Steps

The next sensible step is to split the app into a small layout structure and then implement the first real queue-manager screen.

Suggested order:

1. Create a shared app layout with header, sidebar, and content area.
2. Add the first empty queue page as the main workspace.
3. Start porting the old Python features piece by piece.

## License

This project follows the license of the main repository.
