import { expect, test } from '@playwright/test';
import { Buffer } from 'node:buffer';
import type { CategoryDefinition } from '../src/features/categories/categoryTypes';
import type { GenerationStatusResponse } from '../src/features/generation/generationApi';

const PREVIEW =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1cAAAAASUVORK5CYII=';
const entry = (name: string, favorite = false) => ({
  templateId: name,
  title: name,
  data: {
    positive_prompt: `${name}, natural light`,
    negative_prompt: 'blur',
    loras: '',
    image_path: '',
    favorite,
  },
});

test.beforeEach(async ({ page }) => {
  const categories: CategoryDefinition[] = [
    {
      id: 'characters',
      title: 'Characters',
      placeId: 0,
      templates: [entry('Aster'), entry('Brook', true)],
    },
    { id: 'scenes', title: 'Scenes', placeId: 1, templates: [entry('Alpine meadow')] },
  ];
  let settings = {
    connection: {
      apiUrl: 'http://127.0.0.1:7860',
      model: 'studio.safetensors',
      seed: -1,
      steps: 30,
      width: 1024,
      height: 1024,
    },
    generic: { theme: 'light' },
  };
  let queue: GenerationStatusResponse = {
    status: 'idle',
    queueLength: 0,
    queuePreview: [],
    activeJobLabel: null,
    runCompleted: 0,
    runTotal: 0,
    lastError: null,
  };
  await page.route('**/test-preview.png', (route) =>
    route.fulfill({ contentType: 'image/png', body: Buffer.from(PREVIEW, 'base64') })
  );
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const body = request.method() === 'POST' ? request.postDataJSON() : {};
    let response: unknown;
    if (path === '/api/categories') response = { categories };
    else if (path === '/api/automatic1111/models')
      response = [{ title: 'studio.safetensors', model_name: 'studio' }];
    else if (path === '/api/config/settings') {
      if (request.method() === 'POST') settings = body;
      response = request.method() === 'POST' ? { ok: true } : settings;
    } else if (path.startsWith('/api/config/'))
      response =
        request.method() === 'POST'
          ? { ok: true }
          : {
              selectedPreset: 'Default',
              presets: { Default: path.includes('negative') ? 'low quality' : 'high quality' },
            };
    else if (path === '/api/categorys') {
      const created = {
        id: body.name.toLowerCase().replaceAll(' ', '-'),
        title: body.name,
        placeId: categories.length,
      };
      categories.push({ ...created, templates: [] });
      response = created;
    } else if (path === '/api/categorys/rename') {
      const category = categories.find((item) => item.id === body.oldId)!;
      category.id = body.newName.toLowerCase().replaceAll(' ', '-');
      category.title = body.newName;
      response = {
        oldId: body.oldId,
        id: category.id,
        title: category.title,
        placeId: category.placeId,
      };
    } else if (path === '/api/categorys/reorder') {
      for (const category of categories) category.placeId = body.orderedIds.indexOf(category.id);
      response = { ok: true };
    } else if (path.startsWith('/api/categorys/entries/')) {
      const category = categories.find((item) => item.id === body.categoryId)!;
      const previous = category.templates.find((item) => item.templateId === body.entryName);
      if (path.endsWith('/favorite')) {
        previous!.data.favorite = body.favorite;
        response = body;
      } else if (path.endsWith('/delete')) {
        category.templates = category.templates.filter(
          (item) => item.templateId !== body.entryName
        );
        response = { ok: true };
      } else {
        const name = body.newEntryName ?? body.entryName;
        const saved = {
          templateId: name,
          title: name,
          data: {
            positive_prompt: body.positive_prompt,
            negative_prompt: body.negative_prompt,
            loras: body.loras,
            model: body.model,
            favorite: previous?.data.favorite ?? false,
            image_path: body.removeImage
              ? ''
              : body.imageDataBase64
                ? '/test-preview.png'
                : (previous?.data.image_path ?? ''),
          },
        };
        category.templates = [
          ...category.templates.filter((item) => item.templateId !== body.entryName),
          saved,
        ];
        response = { ...saved, previousTemplateId: body.entryName };
      }
    } else if (path === '/api/generation/preview')
      response = {
        images: Array(body.batchSize).fill(PREVIEW),
        prompt: body.positive_prompt,
        negativePrompt: body.negative_prompt,
      };
    else if (path.startsWith('/api/generation/')) {
      if (path.endsWith('/queue/add')) {
        queue.queuePreview.push(
          ...body.items.map((item: { id: string; summary: string }) => ({
            id: item.id,
            summary: item.summary,
          }))
        );
        queue.status = 'idle';
      } else if (path.endsWith('/start')) {
        if (queue.status !== 'paused') {
          queue.runTotal = queue.queuePreview.length;
          queue.activeJobLabel = queue.queuePreview.shift()?.summary ?? null;
        }
        queue.status = 'running';
      } else if (path.endsWith('/pause')) queue.status = 'paused';
      else if (path.endsWith('/abort')) {
        queue.status = 'aborted';
        queue.queuePreview = [];
        queue.activeJobLabel = null;
      } else if (path.endsWith('/queue/clear'))
        queue = {
          ...queue,
          status: 'idle',
          queuePreview: [],
          runTotal: 0,
          runCompleted: 0,
          activeJobLabel: null,
        };
      queue.queueLength = queue.queuePreview.length;
      response = queue;
    } else {
      await route.fulfill({ status: 500, json: { message: `Unexpected test API: ${path}` } });
      return;
    }
    await route.fulfill({ json: response });
  });
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Add entry to Characters', exact: true })
  ).toBeVisible();
  await expect(page.getByText('Queue server online')).toBeVisible();
});

test('queue statistics show image timings and an estimated remaining duration', async ({
  page,
}, testInfo) => {
  await page.clock.install();
  const snapshot: GenerationStatusResponse = {
    status: 'running',
    queueLength: 10,
    queuePreview: Array.from({ length: 10 }, (_, index) => ({
      id: `waiting-${index}`,
      summary: `Landscape ${index + 1}`,
    })),
    activeJobLabel: 'Landscape',
    runCompleted: 0,
    runTotal: 17,
    lastError: null,
    statistics: {
      generatedImages: 0,
      averageSecondsPerImage: null,
      lastSecondsPerImage: null,
      activeJobSeconds: 3,
      estimatedRemainingSeconds: null,
    },
  };
  await page.route('**/api/generation/status', (route) => route.fulfill({ json: snapshot }));
  await page.clock.fastForward(1600);
  await page.getByRole('button', { name: 'Queue', exact: true }).click();
  const metrics = page.locator('.queue-statistics');
  await expect(metrics.getByText('Not measured', { exact: true })).toHaveCount(2);
  await expect(metrics.getByText('After first image', { exact: true })).toBeVisible();
  snapshot.runCompleted = 6;
  snapshot.statistics = {
    generatedImages: 6,
    averageSecondsPerImage: 12.5,
    lastSecondsPerImage: 14,
    activeJobSeconds: 5,
    estimatedRemainingSeconds: 125,
  };
  await page.clock.fastForward(1600);
  await expect(metrics.getByText('12.5 s', { exact: true })).toBeVisible();
  await expect(metrics.getByText('14.0 s', { exact: true })).toBeVisible();
  await expect(metrics.getByText('~ 2m 5s', { exact: true })).toBeVisible();
  await expect(page.locator('.queue-status-link small')).toHaveText(
    '10 queued / ~ 2m 5s remaining'
  );
  await page.screenshot({
    path: testInfo.outputPath('queue-statistics.png'),
    animations: 'disabled',
  });
  snapshot.status = 'paused';
  snapshot.activeJobLabel = null;
  snapshot.statistics.activeJobSeconds = null;
  await page.clock.fastForward(60000);
  await expect(metrics.getByText('Remaining work (paused)', { exact: true })).toBeVisible();
  await expect(metrics.getByText('~ 2m 5s', { exact: true })).toBeVisible();
  snapshot.status = 'completed';
  snapshot.queueLength = 0;
  snapshot.statistics.estimatedRemainingSeconds = 0;
  await page.clock.fastForward(1600);
  await expect(metrics.getByText('0s', { exact: true })).toBeVisible();
});

for (const theme of ['light', 'dark'] as const) {
  test(`desktop layout and screenshots in ${theme} theme`, async ({ page }, testInfo) => {
    if (theme === 'dark') await page.getByRole('button', { name: 'Switch to dark theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const contrast = await page.evaluate(() => {
      const luminance = (color: string) => {
        const channels = color
          .match(/[\d.]+/g)!
          .slice(0, 3)
          .map(Number)
          .map((channel) => {
            const normalized = channel / 255;
            return normalized <= 0.04045
              ? normalized / 12.92
              : ((normalized + 0.055) / 1.055) ** 2.4;
          });
        return channels.reduce(
          (sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index],
          0
        );
      };
      const ratio = (first: string, second: string) => {
        const values = [luminance(first), luminance(second)].sort(
          (first, second) => second - first
        );
        return (values[0] + 0.05) / (values[1] + 0.05);
      };
      const input = getComputedStyle(document.querySelector('.text-input')!);
      const button = getComputedStyle(document.querySelector('.primary-button')!);
      const heading = getComputedStyle(document.querySelector('h1')!);
      return {
        fieldText: ratio(input.color, input.backgroundColor),
        fieldBorder: ratio(input.borderColor, input.backgroundColor),
        primaryText: ratio(button.color, button.backgroundColor),
        heading: ratio(
          heading.color,
          getComputedStyle(document.querySelector('.app-header')!).backgroundColor
        ),
      };
    });
    expect(contrast.fieldText).toBeGreaterThanOrEqual(4.5);
    expect(contrast.fieldBorder).toBeGreaterThanOrEqual(3);
    expect(contrast.primaryText).toBeGreaterThanOrEqual(4.5);
    expect(contrast.heading).toBeGreaterThanOrEqual(4.5);
    for (const [width, height] of [
      [1920, 1080],
      [1440, 900],
      [1280, 800],
      [1024, 768],
    ]) {
      await page.setViewportSize({ width, height });
      const geometry = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        workspaceBottom: document.querySelector('.workspace')!.getBoundingClientRect().bottom,
        statusTop: document.querySelector('.generation-status-bar')!.getBoundingClientRect().top,
        statusBottom: document.querySelector('.generation-status-bar')!.getBoundingClientRect()
          .bottom,
        height: innerHeight,
      }));
      expect(geometry.overflow).toBe(false);
      expect(geometry.workspaceBottom).toBeLessThanOrEqual(geometry.statusTop);
      expect(geometry.statusBottom).toBeLessThanOrEqual(geometry.height);
      await page.screenshot({
        path: testInfo.outputPath(`library-${theme}-${width}.png`),
        animations: 'disabled',
      });
    }
    await page.getByRole('button', { name: 'Tile view', exact: true }).click();
    await page.screenshot({
      path: testInfo.outputPath(`tiles-${theme}.png`),
      animations: 'disabled',
    });
    await page
      .getByRole('button', { name: 'Edit Aster', exact: true })
      .filter({ visible: true })
      .click();
    await expect(page.locator('#entry-name-input')).toBeFocused();
    await page.screenshot({
      path: testInfo.outputPath(`editor-${theme}.png`),
      animations: 'disabled',
    });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.screenshot({
      path: testInfo.outputPath(`settings-${theme}.png`),
      animations: 'disabled',
    });
    await page.getByRole('button', { name: 'Queue', exact: true }).click();
    await page.screenshot({
      path: testInfo.outputPath(`queue-${theme}.png`),
      animations: 'disabled',
    });
  });
}

test('selection, search and filters survive navigation', async ({ page }) => {
  await page.getByRole('textbox', { name: 'Search all categories' }).fill('Aster');
  await page.getByRole('checkbox', { name: 'Aster', exact: true }).check();
  await expect(page.getByText('1 selected', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Tile view', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Deselect Aster', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await page.getByRole('button', { name: 'Queue', exact: true }).click();
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Deselect Aster', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'List view', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Search all categories' })).toHaveValue('Aster');
  await expect(page.getByRole('checkbox', { name: 'Aster', exact: true })).toBeChecked();
});

test('tile favorite and edit keyboard actions do not select the tile', async ({ page }) => {
  await page.getByRole('button', { name: 'Tile view', exact: true }).click();
  const favorite = page
    .getByRole('button', { name: 'Mark Aster as favorite', exact: true })
    .filter({ visible: true });
  await favorite.focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Select Aster', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false'
  );
  const edit = page
    .getByRole('button', { name: 'Edit Aster', exact: true })
    .filter({ visible: true });
  await edit.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('#entry-name-input')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(edit).toBeFocused();
  await expect(page.getByText('0 selected', { exact: true })).toBeVisible();
});

test('dirty dialog requires confirmation and traps focus', async ({ page }) => {
  const trigger = page.getByRole('button', { name: 'Add entry to Characters', exact: true });
  await trigger.click();
  await page.locator('#entry-name-input').fill('New entry');
  await page.keyboard.press('Escape');
  await expect(page.getByText('Discard unsaved changes?')).toBeVisible();
  await page.getByRole('button', { name: 'Keep editing' }).click();
  await page.getByRole('button', { name: 'Close entry window' }).focus();
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('dialog')))).toBe(true);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test('preview batch, selection, save and delete keep their contracts', async ({ page }) => {
  await page.getByRole('button', { name: 'Add entry to Characters', exact: true }).click();
  await page.locator('#entry-name-input').fill('Cedar');
  await page.locator('#entry-positive-input').fill('A forest portrait');
  await page.getByRole('button', { name: '3x3', exact: true }).click();
  const previewRequest = page.waitForRequest((request) =>
    request.url().endsWith('/api/generation/preview')
  );
  await page.getByRole('button', { name: 'Generate 9', exact: true }).click();
  expect((await previewRequest).postDataJSON().batchSize).toBe(9);
  await expect(page.locator('.entry-generated-tile')).toHaveCount(9);
  await page.getByRole('button', { name: 'Select preview 3', exact: true }).click();
  await expect(page.locator('.entry-generated-tile[aria-pressed="true"]')).toHaveCount(1);
  await page.getByRole('button', { name: '2x2', exact: true }).click();
  await expect(page.locator('.entry-generated-grid')).toHaveClass(/entry-generated-grid-9/);
  await page.getByRole('button', { name: 'Generate 4', exact: true }).click();
  await expect(page.locator('.entry-generated-tile')).toHaveCount(4);
  await page.getByRole('button', { name: 'Select preview 2', exact: true }).click();
  const saveRequest = page.waitForRequest((request) =>
    request.url().endsWith('/api/categorys/entries/create')
  );
  await page.getByRole('button', { name: 'Save entry', exact: true }).click();
  expect((await saveRequest).postDataJSON()).toMatchObject({
    entryName: 'Cedar',
    imageDataBase64: PREVIEW,
  });
  await expect(page.getByRole('checkbox', { name: 'Cedar', exact: true })).toBeVisible();
  await page
    .getByRole('button', { name: 'Edit Cedar', exact: true })
    .filter({ visible: true })
    .click();
  await page.getByRole('button', { name: 'Delete entry', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm delete', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Cedar', exact: true })).toHaveCount(0);
});

test('queue commands share status across all pages and carry presets', async ({ page }) => {
  await page.getByRole('checkbox', { name: 'Aster', exact: true }).check();
  const added = page.waitForRequest((request) =>
    request.url().endsWith('/api/generation/queue/add')
  );
  await page.getByRole('button', { name: 'Add to queue', exact: true }).click();
  const payload = (await added).postDataJSON();
  expect(payload.items[0].prompt).toContain('high quality');
  expect(payload.items[0].negativePrompt).toContain('low quality');
  await page.getByRole('button', { name: 'Queue', exact: true }).click();
  await expect(page.locator('.queue-job-list li')).toHaveCount(1);
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Clear queue', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Add to queue', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.getByRole('button', { name: 'Abort generation', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Abort generation', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Queue', exact: true }).click();
  await page.getByRole('button', { name: 'Add to queue', exact: true }).click();
  await expect(page.locator('.queue-job-list li')).toHaveCount(1);
  await page.getByRole('button', { name: 'Clear queue', exact: true }).click();
  await expect(page.locator('.queue-job-list li')).toHaveCount(0);
  const opened = page.waitForRequest((request) =>
    request.url().endsWith('/api/generation/output/open-today')
  );
  await page.getByRole('button', { name: 'Open output folder', exact: true }).click();
  expect((await opened).method()).toBe('POST');
  await expect(page.getByText('Output folder opened.', { exact: true })).toBeVisible();
});

test('settings saves preserve independent persisted sections', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Steps', exact: true }).fill('42');
  const saved = page.waitForRequest(
    (request) => request.method() === 'POST' && request.url().endsWith('/api/config/settings')
  );
  await page.getByRole('button', { name: 'Save connection settings', exact: true }).click();
  expect((await saved).postDataJSON()).toMatchObject({
    connection: { steps: 42 },
    generic: { theme: 'light' },
  });
  await expect(page.getByText('Connection and generation settings saved.')).toBeVisible();
  await page.getByRole('button', { name: 'Appearance', exact: true }).click();
  await expect(page.getByText('Connection and generation settings saved.')).not.toBeVisible();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  const appearance = page.waitForRequest(
    (request) => request.method() === 'POST' && request.url().endsWith('/api/config/settings')
  );
  await page.getByRole('button', { name: 'Save appearance', exact: true }).click();
  expect((await appearance).postDataJSON()).toMatchObject({
    connection: { steps: 42 },
    generic: { theme: 'dark' },
  });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('category creation and rename preserve selection', async ({ page }) => {
  await page.getByRole('button', { name: 'Add category', exact: true }).click();
  await page.locator('#category-name-input').fill('Objects');
  await page.getByRole('button', { name: 'Create category', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Add entry to Objects', exact: true })
  ).toBeVisible();
  await page.getByRole('checkbox', { name: 'Aster', exact: true }).check();
  await page.getByRole('button', { name: 'Rename Characters', exact: true }).click();
  await page.locator('.category-rename-input').fill('People');
  await page.locator('.category-rename-input').press('Enter');
  await expect(
    page.getByRole('button', { name: 'Add entry to People', exact: true })
  ).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Aster', exact: true })).toBeChecked();
});

test('category errors offer a working retry', async ({ page }) => {
  let failing = true;
  await page.route('**/api/categories', async (route) => {
    if (failing) await route.fulfill({ status: 503, json: { message: 'Library unavailable' } });
    else await route.fallback();
  });
  await page.reload();
  await expect(page.getByText('Library unavailable', { exact: true })).toBeVisible();
  failing = false;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Add entry to Characters', exact: true })
  ).toBeVisible();
});

test('favorite filter and select-all preserve hidden selections', async ({ page }) => {
  const column = page.locator('.category-column').first();
  await column.getByRole('button', { name: 'Select all', exact: true }).click();
  await expect(page.getByText('2 selected', { exact: true })).toBeVisible();
  await column.getByRole('button', { name: 'Favorites', exact: true }).click();
  await expect(column.getByRole('checkbox', { name: 'Aster', exact: true })).toHaveCount(0);
  await column.getByRole('button', { name: 'Select all', exact: true }).click();
  await expect(page.getByText('1 selected', { exact: true })).toBeVisible();
  await column.getByRole('button', { name: 'Favorites', exact: true }).click();
  await expect(column.getByRole('checkbox', { name: 'Aster', exact: true })).toBeChecked();
  await expect(column.getByRole('checkbox', { name: 'Brook', exact: true })).not.toBeChecked();
});

test('command errors survive a successful status poll', async ({ page }) => {
  await page.clock.install();
  await page.route('**/api/generation/queue/add', (route) =>
    route.fulfill({ status: 503, json: { message: 'Queue temporarily unavailable' } })
  );
  await page.getByRole('checkbox', { name: 'Aster', exact: true }).check();
  await page.getByRole('button', { name: 'Add to queue', exact: true }).click();
  await expect(page.getByText('Queue temporarily unavailable', { exact: true })).toBeVisible();
  await page.clock.fastForward(2000);
  await expect(page.getByText('Queue temporarily unavailable', { exact: true })).toBeVisible();
});

test('model endpoint failure leaves an editable fallback', async ({ page }) => {
  await page.route('**/api/automatic1111/models?*', (route) =>
    route.fulfill({ status: 503, json: { message: 'Offline' } })
  );
  await page
    .getByRole('button', { name: 'Edit Aster', exact: true })
    .filter({ visible: true })
    .click();
  await expect(page.locator('#entry-model-input')).toHaveJSProperty('tagName', 'INPUT');
  await page.locator('#entry-model-input').fill('manual.safetensors');
  const updated = page.waitForRequest((request) =>
    request.url().endsWith('/api/categorys/entries/update')
  );
  await page.getByRole('button', { name: 'Save entry', exact: true }).click();
  expect((await updated).postDataJSON().model).toBe('manual.safetensors');
});

test('queue state screenshots include running, paused, completed, aborted and errors', async ({
  page,
}, testInfo) => {
  await page.clock.install();
  const snapshot: GenerationStatusResponse = {
    status: 'running',
    queueLength: 1,
    queuePreview: [{ id: 'waiting', summary: 'Characters: Brook | Scenes: Alpine meadow' }],
    activeJobLabel: 'Characters: Aster | Scenes: Alpine meadow',
    runCompleted: 1,
    runTotal: 3,
    lastError: null,
  };
  await page.route('**/api/generation/status', (route) => route.fulfill({ json: snapshot }));
  await page.getByRole('button', { name: 'Queue', exact: true }).click();
  for (const status of ['running', 'paused', 'completed', 'aborted'] as const) {
    snapshot.status = status;
    if (status === 'completed' || status === 'aborted') {
      snapshot.activeJobLabel = null;
      snapshot.queueLength = 0;
      snapshot.queuePreview = [];
    }
    await page.clock.fastForward(1600);
    await expect(page.locator('.queue-run-summary h3')).toHaveText(status);
    await page.screenshot({
      path: testInfo.outputPath(`queue-${status}.png`),
      animations: 'disabled',
    });
  }
  snapshot.lastError = 'Automatic1111 is unavailable';
  await page.clock.fastForward(1600);
  await expect(page.getByRole('alert')).toHaveText('Automatic1111 is unavailable');
  await page.screenshot({ path: testInfo.outputPath('queue-error.png'), animations: 'disabled' });
});

test('icon tooltips work with keyboard focus, including inside dialogs', async ({ page }) => {
  await page.getByRole('button', { name: 'Switch to dark theme', exact: true }).focus();
  await expect(
    page.getByRole('tooltip', { name: 'Switch to dark theme', exact: true })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Add entry to Characters', exact: true }).click();
  await page.getByRole('button', { name: 'Close entry window', exact: true }).focus();
  await expect(
    page.getByRole('tooltip', { name: 'Close entry window', exact: true })
  ).toBeVisible();
});

test('empty categories and narrow zoom-equivalent desktop remain usable', async ({
  page,
}, testInfo) => {
  await page.route('**/api/categories', (route) => route.fulfill({ json: { categories: [] } }));
  await page.reload();
  await page.setViewportSize({ width: 720, height: 450 });
  await expect(page.getByRole('heading', { name: 'No categories yet' })).toBeVisible();
  await page.getByRole('button', { name: 'Add category', exact: true }).last().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const bounds = await page.getByRole('dialog').boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(450);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({
    path: testInfo.outputPath('narrow-desktop-dialog.png'),
    animations: 'disabled',
  });
});

test('image upload, replacement and removal preserve save payloads', async ({ page }) => {
  await page
    .getByRole('button', { name: 'Edit Aster', exact: true })
    .filter({ visible: true })
    .click();
  await page.getByLabel('Upload image').setInputFiles({
    name: 'original.png',
    mimeType: 'image/png',
    buffer: Buffer.from(PREVIEW, 'base64'),
  });
  await expect(page.getByAltText('Entry preview')).toBeVisible();
  await page.getByLabel('Upload image').setInputFiles({
    name: 'replacement.png',
    mimeType: 'image/png',
    buffer: Buffer.from(PREVIEW, 'base64'),
  });
  const replacement = page.waitForRequest((request) =>
    request.url().endsWith('/api/categorys/entries/update')
  );
  await page.getByRole('button', { name: 'Save entry', exact: true }).click();
  expect((await replacement).postDataJSON()).toMatchObject({
    imageOriginalName: 'replacement.png',
    imageDataBase64: PREVIEW,
    removeImage: false,
  });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Edit Aster', exact: true })
    .filter({ visible: true })
    .click();
  await expect(page.getByAltText('Entry preview')).toHaveJSProperty('naturalWidth', 1);
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByText('Image will be removed on save.')).toBeVisible();
  const removal = page.waitForRequest((request) =>
    request.url().endsWith('/api/categorys/entries/update')
  );
  await page.getByRole('button', { name: 'Save entry', exact: true }).click();
  expect((await removal).postDataJSON()).toMatchObject({ removeImage: true });
});

test('category drag order persists and failed reorder rolls back', async ({ page }) => {
  await page.getByRole('checkbox', { name: 'Aster', exact: true }).check();
  const columns = page.locator('.category-column');
  const first = columns.first();
  const bounds = await first.boundingBox();
  const reordered = page.waitForRequest((request) =>
    request.url().endsWith('/api/categorys/reorder')
  );
  await page
    .getByRole('heading', { name: 'Scenes 1' })
    .dragTo(first, { targetPosition: { x: 5, y: bounds!.height / 2 } });
  expect((await reordered).postDataJSON().orderedIds).toEqual(['scenes', 'characters']);
  await expect(columns.first().getByRole('heading')).toHaveText('Scenes 1');
  await page.route('**/api/categorys/reorder', (route) =>
    route.fulfill({ status: 503, json: { message: 'Order could not be saved' } })
  );
  await page
    .getByRole('heading', { name: 'Characters 2' })
    .dragTo(columns.first(), { targetPosition: { x: 5, y: bounds!.height / 2 } });
  await expect(page.getByText('Order could not be saved', { exact: true })).toBeVisible();
  await expect(columns.first().getByRole('heading')).toHaveText('Scenes 1');
  await expect(page.getByRole('checkbox', { name: 'Aster', exact: true })).toBeChecked();
});

test('long content fits the editor at a 200-percent-equivalent desktop viewport', async ({
  page,
}, testInfo) => {
  const title = 'ExtendedCharacterName'.repeat(8);
  const categories: CategoryDefinition[] = [
    {
      id: 'extended',
      title: 'ExtendedCategoryName'.repeat(8),
      placeId: 0,
      templates: [
        {
          ...entry(title),
          data: {
            ...entry(title).data,
            model: 'extended-model-name-'.repeat(12),
            positive_prompt: 'A detailed landscape prompt. '.repeat(200),
          },
        },
      ],
    },
  ];
  await page.route('**/api/categories', (route) => route.fulfill({ json: { categories } }));
  await page.setViewportSize({ width: 960, height: 540 });
  await page.reload();
  await page
    .getByRole('button', { name: `Edit ${title}`, exact: true })
    .filter({ visible: true })
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const dialog = await page.getByRole('dialog').boundingBox();
  const save = await page.getByRole('button', { name: 'Save entry', exact: true }).boundingBox();
  expect(dialog!.x + dialog!.width).toBeLessThanOrEqual(960);
  expect(save!.y + save!.height).toBeLessThanOrEqual(540);
  for (const name of ['Save entry', 'Cancel', 'Close entry window']) {
    const action = page.getByRole('button', { name, exact: true });
    await expect(action).toBeInViewport({ ratio: 1 });
    const bounds = await action.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(dialog!.x);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(dialog!.x + dialog!.width);
  }
  expect(
    await page.getByRole('dialog').evaluate((element) => element.scrollWidth > element.clientWidth)
  ).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({
    path: testInfo.outputPath('long-content-zoom-equivalent.png'),
    animations: 'disabled',
  });
});
