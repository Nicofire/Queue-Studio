import {
  AlertCircle,
  Grid2X2,
  Layers,
  Library,
  List,
  ListOrdered,
  Moon,
  Settings,
  Sun,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import './App.css';

import { GenerationStatusBar } from './components/GenerationStatusBar';
import { IconButton } from './components/IconButton';
import { loadCategoriesFromProject } from './features/categories/categoryApi';
import type { CategoryDefinition } from './features/categories/categoryTypes';
import { useCategorySelection } from './features/categories/useCategorySelection';
import { resolveSelectedPresetText } from './features/generation/promptComposition';
import { useGenerationQueue } from './features/generation/useGenerationQueue';
import { useProjectSettings } from './features/settings/useProjectSettings';
import { ListViewPage } from './pages/ListViewPage';
import { QueuePage } from './pages/QueuePage';
import { SettingsPage } from './pages/SettingsPage';
import { TileViewPage } from './pages/TileViewPage';

function App() {
  const [activePage, setActivePage] = useState<'Library' | 'Queue' | 'Settings'>('Library');
  const [libraryMode, setLibraryMode] = useState<'list' | 'tile'>('list');
  const [categories, setCategories] = useState<CategoryDefinition[]>([]);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const { selectionByCategory, setSelectionByCategory, toggleTemplate } = useCategorySelection();
  const {
    positivePresetGroup,
    setPositivePresetGroup,
    negativePresetGroup,
    setNegativePresetGroup,
    generationSettings,
    setGenerationSettings,
    settingsError,
  } = useProjectSettings();
  const queue = useGenerationQueue({
    generationSettings,
    categories,
    selectionByCategory,
    globalPositivePrompt: resolveSelectedPresetText(positivePresetGroup),
    globalNegativePrompt: resolveSelectedPresetText(negativePresetGroup),
  });

  useEffect(() => {
    let isMounted = true;

    const loadCategories = async () => {
      try {
        const loaded = await loadCategoriesFromProject();
        if (!isMounted) {
          return;
        }
        setCategories(loaded);
        setCategoriesError(null);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        if (error instanceof Error) {
          setCategoriesError(error.message);
        } else {
          setCategoriesError('Could not load categories from API.');
        }
      } finally {
        if (isMounted) setIsLoadingCategories(false);
      }
    };

    void loadCategories();

    return () => {
      isMounted = false;
    };
  }, [loadAttempt]);

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        {settingsError ? (
          <p role="alert" className="field-hint is-error">
            {settingsError}
          </p>
        ) : null}
        <div className="app-brand">
          <span className="brand-mark">
            <Layers size={22} />
          </span>
          <div>
            <strong>Queue Studio</strong>
            <span>Stable Diffusion</span>
          </div>
        </div>
        <nav className="app-navigation" aria-label="Main navigation">
          {(
            [
              { name: 'Library', icon: Library },
              { name: 'Queue', icon: ListOrdered },
              { name: 'Settings', icon: Settings },
            ] as const
          ).map(({ name, icon: Icon }) => (
            <button
              type="button"
              key={name}
              className={activePage === name ? 'nav-item is-active' : 'nav-item'}
              aria-label={name}
              title={name}
              aria-current={activePage === name ? 'page' : undefined}
              onClick={() => setActivePage(name)}
            >
              <Icon size={18} />
              <span>{name}</span>
              {name === 'Queue' ? <small className="nav-count">{queue.queueLength}</small> : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="eyebrow">Workspace</span>
          <span>{categories.length} categories</span>
          <span>
            {categories.reduce((sum, category) => sum + category.templates.length, 0)} entries
          </span>
        </div>
      </aside>
      <header className="app-header">
        <div className="page-heading">
          <span className="eyebrow">Workspace</span>
          <h1>{activePage}</h1>
        </div>
        {activePage === 'Library' ? (
          <div className="view-switch" role="group" aria-label="Library view">
            <button
              type="button"
              aria-label="List view"
              aria-pressed={libraryMode === 'list'}
              title="List view"
              onClick={() => setLibraryMode('list')}
            >
              <List size={16} />
              <span>List</span>
            </button>
            <button
              type="button"
              aria-label="Tile view"
              aria-pressed={libraryMode === 'tile'}
              title="Tile view"
              onClick={() => setLibraryMode('tile')}
            >
              <Grid2X2 size={16} />
              <span>Tiles</span>
            </button>
          </div>
        ) : null}
        <div className="header-actions">
          <span className="connection-badge">
            <span
              className="status-dot"
              data-status={queue.isConnected ? 'connected' : 'offline'}
            />
            {queue.isConnected ? 'Queue server online' : 'Queue server offline'}
          </span>
          <IconButton
            label={
              generationSettings.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
            }
            onClick={() =>
              setGenerationSettings((current) => ({
                ...current,
                theme: current.theme === 'dark' ? 'light' : 'dark',
              }))
            }
          >
            {generationSettings.theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </IconButton>
        </div>
      </header>
      <main className="workspace" id="workspace">
        {categoriesError ? (
          <div className="inline-notice is-error" role="alert">
            <AlertCircle size={17} />
            <span>{categoriesError}</span>
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setIsLoadingCategories(true);
                setCategoriesError(null);
                setLoadAttempt((current) => current + 1);
              }}
            >
              Retry
            </button>
          </div>
        ) : null}
        {isLoadingCategories && activePage === 'Library' ? (
          <p role="status" className="loading-state">
            Loading library...
          </p>
        ) : null}
        <div
          className="library-workspace library-list"
          hidden={
            activePage !== 'Library' ||
            libraryMode !== 'list' ||
            isLoadingCategories ||
            Boolean(categoriesError)
          }
        >
          <ListViewPage
            categories={categories}
            setCategories={setCategories}
            selectionByCategory={selectionByCategory}
            setSelectionByCategory={setSelectionByCategory}
            toggleTemplate={toggleTemplate}
            generationSettings={generationSettings}
            generationBusy={queue.isBusy}
          />
        </div>
        <div
          className="library-workspace"
          hidden={
            activePage !== 'Library' ||
            libraryMode !== 'tile' ||
            isLoadingCategories ||
            Boolean(categoriesError)
          }
        >
          <TileViewPage
            categories={categories}
            setCategories={setCategories}
            selectionByCategory={selectionByCategory}
            setSelectionByCategory={setSelectionByCategory}
            toggleTemplate={toggleTemplate}
            generationSettings={generationSettings}
            generationBusy={queue.isBusy}
          />
        </div>
        {activePage === 'Queue' ? (
          <QueuePage queue={queue} onOpenLibrary={() => setActivePage('Library')} />
        ) : null}
        {activePage === 'Settings' ? (
          <SettingsPage
            positivePresetGroup={positivePresetGroup}
            negativePresetGroup={negativePresetGroup}
            setPositivePresetGroup={setPositivePresetGroup}
            setNegativePresetGroup={setNegativePresetGroup}
            generationSettings={generationSettings}
            setGenerationSettings={setGenerationSettings}
            isBusy={queue.isBusy}
          />
        ) : null}
      </main>
      <GenerationStatusBar queue={queue} onOpenQueue={() => setActivePage('Queue')} />
    </div>
  );
}

export default App;
