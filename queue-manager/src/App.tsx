import { useEffect, useState } from 'react';
import './App.css';

import { GenerationQueueDock } from './components/GenerationQueueDock';
import { TabBar } from './components/TabBar';
import { tabs, type TabName } from './components/tabs';
import { loadCategoriesFromProject } from './features/categories/categoryApi';
import type { CategoryDefinition } from './features/categories/categoryTypes';
import { useCategorySelection } from './features/categories/useCategorySelection';
import { EditorPage } from './pages/EditorPage';
import { ListViewPage } from './pages/ListViewPage';
import { SettingsPage } from './pages/SettingsPage';
import { TileViewPage } from './pages/TileViewPage';

function App() {
  const [activeTab, setActiveTab] = useState<TabName>('List View');
  const [categories, setCategories] = useState<CategoryDefinition[]>([]);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const { selectionByCategory, setSelectionByCategory, toggleTemplate } = useCategorySelection();

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
      }
    };

    void loadCategories();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <main className="app-shell">
      <header className="top-bar" aria-label="Main navigation tabs">
        <TabBar activeTab={activeTab} tabs={tabs} onTabChange={setActiveTab} />
      </header>

      <section className="workspace" aria-live="polite">
        <div className="workspace-panel">
          {categoriesError ? <p className="field-hint is-error">{categoriesError}</p> : null}
          {activeTab === 'List View' ? (
            <ListViewPage
              categories={categories}
              setCategories={setCategories}
              selectionByCategory={selectionByCategory}
              setSelectionByCategory={setSelectionByCategory}
              toggleTemplate={toggleTemplate}
            />
          ) : null}
          {activeTab === 'Tile View' ? (
            <TileViewPage
              categories={categories}
              selectionByCategory={selectionByCategory}
              toggleTemplate={toggleTemplate}
            />
          ) : null}
          {activeTab === 'Editor' ? <EditorPage /> : null}
          {activeTab === 'Settings' ? <SettingsPage /> : null}
        </div>
      </section>

      <GenerationQueueDock categories={categories} selectionByCategory={selectionByCategory} />
    </main>
  );
}

export default App;
