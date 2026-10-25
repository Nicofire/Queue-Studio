<!-- markdownlint-disable MD033 MD041 -->

<p align="center">
<img src="public/favicon.svg" alt="Queue Studio Layers logo" width="72" height="72" />
</p>

<h1 align="center">Queue Studio</h1>

<p align="center">
<strong>Your prompt library and generation queue for AUTOMATIC1111 and ComfyUI.</strong><br />
Compose prompts, organize entries, and manage Stable Diffusion generations locally.
</p>

<p align="center">
<a href="#quick-start">Quick Start</a> &middot;
<a href="#features">Features</a> &middot;
<a href="#data-and-persistence">Your Data</a> &middot;
<a href="#development">Development</a>
</p>

<!-- markdownlint-enable MD033 MD041 -->

---

> **Local-first.** Queue Studio manages your library, jobs, previews, and output. Image generation runs in your separate AUTOMATIC1111 or ComfyUI instance.

## Features

| Workspace              | What you can do                                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Library**            | Browse list and tile views, search, filter favorites, select entries, and create categories.                      |
| **Entry editor**       | Create, edit, and delete entries with positive and negative prompts, LoRAs, models, and preview images.           |
| **Image import**       | Import supported generation metadata from dropped images into the entry editor.                                   |
| **Preview generation** | Generate 1, 4, or 9 images and choose the image to save with an entry.                                            |
| **Queue**              | Build jobs from selected category entries, add or clear jobs, start or resume, pause between jobs, and abort.     |
| **Progress**           | Track generation status, image count, image timings, and estimated remaining duration across all pages.           |
| **Connections**        | Switch between independently saved AUTOMATIC1111 and ComfyUI profiles, with connection tests and model discovery. |
| **ComfyUI workflows**  | Use the bundled txt2img workflow or import API workflows with explicit input and image-output bindings.           |
| **Settings**           | Configure model, seed, steps, dimensions, timeout, and global prompt presets.                                     |
| **Appearance**         | Switch between light and dark themes, with Lucide icons and a matching Layers favicon.                            |

## Requirements

- Node.js 20.19+ in the 20.x line, or Node.js 22.12+; a current LTS release is recommended.
- npm and a modern browser.
- For image generation: a running AUTOMATIC1111 WebUI with `--api`, or a running ComfyUI instance with its normal HTTP API.

## Quick Start

Run these commands from the repository root:

```bash
npm install
npm run dev
```

Open the local URL printed by Vite, normally `http://localhost:5173`. The development server also provides the local API used for project data and generation.

On Windows, double-click [webui-user.bat](webui-user.bat) to start Queue Studio and open the browser after dependencies are installed. Despite its name, this script starts Queue Studio, not AUTOMATIC1111.

### Connect AUTOMATIC1111

1. Start your separate AUTOMATIC1111 WebUI with `--api` enabled.
2. Open **Settings** in Queue Studio.
3. Select **AUTOMATIC1111**, set the API URL (normally `http://127.0.0.1:7860`), and select a model.
4. Configure generation parameters and click **Save connection settings** before generating.

### Connect ComfyUI

1. Start your separate ComfyUI instance normally. No `--api` argument is required.
2. Open **Settings > Connection & generation** and select **ComfyUI**.
3. Set the API URL (normally `http://127.0.0.1:8188`), test the connection, and select a checkpoint.
4. Select **Standard txt2img (SD 1.5 / SDXL)** or import a compatible API workflow.
5. Click **Save connection settings** before generating previews or starting the queue.

The bundled workflow uses ComfyUI Core nodes, Euler sampling, CFG 7, and `PreviewImage` output. Checkpoints and any LoRAs must already be installed in ComfyUI. Common `<lora:name:weight>` tags in the positive prompt become linked `LoraLoader` nodes; unknown or ambiguous LoRA names are rejected before submission.

#### Custom API Workflows

Export the executable **API format** from ComfyUI, then choose **Import API workflow**. The editor's `nodes`/`links` JSON format is not executable and is rejected. Imports are limited to 2 MiB and 1,000 nodes.

Review the input bindings and select the image output nodes. Bindings can target multiple literal node inputs for positive/negative prompts, model, seed, steps, width, height, and batch size. Unbound inputs retain their exported workflow values. Model, seed, steps, and dimension controls are disabled where no mapping exists. A workflow without a batch-size binding uses single-image previews. Selected outputs must produce exactly the requested number of PNG images, with at most 16 images, 32 MiB per image, and 128 MiB combined.

Custom workflows may include static LoRA nodes, but dynamic library LoRA tags are supported only by the bundled workflow. Node classes and model choices are checked against the connected server before queued jobs are removed. Missing custom nodes or models must be installed on ComfyUI separately; Queue Studio does not convert editor graphs, install nodes, or construct model-family-specific graphs such as FLUX automatically.

> **Import trusted workflows only.** Custom ComfyUI nodes can have filesystem or network side effects. A workflow containing `SaveImage` can write images on the ComfyUI server even during a preview. Queue Studio previews do not write to Queue Studio's `output/` folder.

#### Connection and Run Behavior

There is one active provider for each run, with separate retained connection profiles. Switching profiles does not translate existing per-entry model names between backends. Unsaved connection changes are rejected by generation endpoints. Settings use schema version 2; older flat or `connection` settings migrate to AUTOMATIC1111 in memory and are written in the new format only on an explicit save.

A queue run freezes its saved connection and workflow through pause/resume. Connection changes, workflow changes, and simultaneous previews are blocked while it is active; appearance saves remain available. The default per-job timeouts are 180 seconds for AUTOMATIC1111 and 900 seconds for ComfyUI, including ComfyUI's remote queue wait, execution, and image download. Pause takes effect between local jobs.

ComfyUI abort uses job-specific cancellation when supported. On older servers, only the app's own pending prompt is removed; an already-running job may continue remotely. Queue Studio never uses a global ComfyUI interrupt or clears another client's queue/history. AUTOMATIC1111 abort stops the local request but does not guarantee GPU execution has stopped.

Library browsing and editing do not require a running image-generation backend; generating previews and queue images does. All upstream API calls are made by the local development server, not directly by the browser.

### Generate Images

1. In **Library**, select entries from the categories you want to combine.
2. Add the selection to the queue. Global prompt presets are included in the composed prompts.
3. Open **Queue** to inspect jobs and start generation.
4. Use the generation controls to pause, resume, abort, or open the output folder.

Queue-generated images are saved under `output/YYYY-MM-DD/`. Entry-editor previews are not written to that output folder; saving an entry stores its chosen preview with the library assets.

## Data and Persistence

| Location                                                 | Contents                                                |
| -------------------------------------------------------- | ------------------------------------------------------- |
| [data/categorys/](data/categorys/)                       | Category definitions and entries as JSON files.         |
| [data/settings.json](data/settings.json)                 | Connection, generation, and theme settings.             |
| `data/comfyui-workflows/`                                | User-imported API workflows and bindings (git-ignored). |
| [data/positive-presets.json](data/positive-presets.json) | Global positive prompt presets.                         |
| [data/negative-presets.json](data/negative-presets.json) | Global negative prompt presets.                         |
| [public/static/images/](public/static/images/)           | Library image assets.                                   |
| `output/YYYY-MM-DD/`                                     | Generated queue images, grouped by local date.          |

The `categorys` spelling matches the current file structure.

Missing settings and preset files in `data/` are initialized from the corresponding defaults in `public/`. Settings and presets also use browser local storage.

> **Back up your work.** Preserve `data/`, library images in `public/static/images/`, and `output/`. The active queue and its statistics are held in server memory and are lost when the development server restarts.

## Development

The project uses React 19, TypeScript, Vite, Lucide React, IBM Plex Sans, ESLint, and Playwright.

### Build and Lint

```bash
npm run build
npm run lint
```

The build runs TypeScript project checks and creates the frontend bundle in `dist/`.

### Tests

Install Playwright's Chromium browser once, then run the test suite:

```bash
npx playwright install chromium
npm run test:ui
```

The suite covers browser workflows and layouts, profile migration, workflow bindings and LoRAs, generation statistics, and both providers using temporary project data and local fake image-generation servers. It does not require a GPU, AUTOMATIC1111, or ComfyUI. Real-engine compatibility still needs a smoke test against your installed backend and custom nodes.

Playwright uses `http://127.0.0.1:5181` and starts a Vite server automatically, or reuses an existing server on that address outside CI. Keep that port free of unrelated servers.

### Continuous Integration

The [GitHub Actions workflow](.github/workflows/ci.yml) runs on every push and pull request. It can also be started manually from **Actions > CI > Run workflow** once the workflow is on the default branch.

Two jobs run independently on Ubuntu 24.04 with Node.js 22 and cached npm downloads. The Ubuntu version is pinned to avoid automatic operating-system migrations. Artifact uploads use `actions/upload-artifact@v7`, which runs on Node.js 24 independently of the application's Node.js version.

| Job                       | Checks and artifacts                                                                                                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Lint and build**        | Installs locked dependencies with `npm ci`, runs ESLint and the TypeScript/Vite build, and uploads `frontend-dist` for 7 days.                                                                          |
| **Browser and API tests** | Installs Chromium and its system dependencies, runs the full Playwright suite, and uploads `playwright-results` for 14 days, including HTML/JUnit reports and available failure screenshots and traces. |

Open a workflow run in GitHub Actions to inspect job logs and download its artifacts. Tests use mocked or local fake APIs, so no GPU, AUTOMATIC1111 instance, or repository secrets are required. A newer run cancels an older in-progress run for the same branch or pull request.

The `frontend-dist` artifact contains only the built frontend. This workflow does not deploy the application; the local API still requires the development server described below.

### Production Preview and Limitations

```bash
npm run build
npm run preview
```

> **Frontend preview only.** The project API is **not available in preview mode or on static hosting**. Use `npm run dev` for the complete local application.

`npm run preview` serves only the built frontend. The project API is registered through Vite's development-server middleware; a standalone production backend is not included.

The local API can modify project files and initiate generation. Keep the server local; it is not an authenticated, multi-user service intended for public exposure.

## Project Structure

```text
.
|-- .github/workflows/ci.yml # GitHub Actions checks and test reports
|-- data/                    # Persistent categories, settings, and presets
|-- dev-server/              # Local APIs, providers, and bundled ComfyUI workflow
|-- docs/                    # Design notes and project documentation
|-- output/                  # Generated queue images by date
|-- public/                  # Favicon, default JSON files, and library assets
|-- src/
|   |-- components/          # Shared UI and entry dialogs
|   |-- features/
|   |   |-- categories/      # Category data, selection, and entry actions
|   |   |-- generation/      # Queue client, prompt composition, and statistics
|   |   `-- settings/        # Shared project settings state
|   |-- pages/               # Library, queue, and settings views
|   |-- App.tsx              # Application shell and shared state
|   |-- App.css
|   `-- main.tsx
|-- tests/                   # Playwright UI and generation tests
|-- index.html
|-- package.json
|-- playwright.config.ts
|-- vite.config.ts
`-- webui-user.bat           # Windows launcher for Queue Studio
```
