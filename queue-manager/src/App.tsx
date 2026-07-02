import { useState, type ReactElement } from 'react';
import './App.css';

import { TabBar } from './components/TabBar';
import { tabs, type TabName } from './components/tabs';
import { EditorPage } from './pages/EditorPage';
import { ListViewPage } from './pages/ListViewPage';
import { SettingsPage } from './pages/SettingsPage';
import { TileViewPage } from './pages/TileViewPage';

const pageByTab = {
  'List View': ListViewPage,
  'Tile View': TileViewPage,
  Editor: EditorPage,
  Settings: SettingsPage,
} as const satisfies Record<TabName, () => ReactElement>;

function App() {
  const [activeTab, setActiveTab] = useState<TabName>('List View');
  const ActivePage = pageByTab[activeTab];

  return (
    <main className="app-shell">
      <header className="top-bar" aria-label="Main navigation tabs">
        <TabBar activeTab={activeTab} tabs={tabs} onTabChange={setActiveTab} />
      </header>

      <section className="workspace" aria-live="polite">
        <div className="workspace-panel">
          <ActivePage />
        </div>
      </section>
    </main>
  );
}

export default App;
