import { useState } from 'react'
import './App.css'

import { TabBar } from './components/TabBar'
import { tabs, type TabName } from './components/tabs'

function App() {
  const [activeTab, setActiveTab] = useState<TabName>('List View')

  return (
    <main className="app-shell">
      <header className="top-bar" aria-label="Main navigation tabs">
        <TabBar activeTab={activeTab} tabs={tabs} onTabChange={setActiveTab} />
      </header>

      <section className="workspace" aria-live="polite">
        <div
          className="workspace-panel"
          role="tabpanel"
          id={`${activeTab.toLowerCase().replace(/\s+/g, '-')}-panel`}
          aria-labelledby={`${activeTab.toLowerCase().replace(/\s+/g, '-')}-tab`}
        >
          <p className="panel-label">{activeTab}</p>
          <h2>Bereich wird als Nächstes aufgebaut</h2>
          <p className="subtitle">
            Hier kommt später die erste echte {activeTab.toLowerCase()}-Ansicht
            für den Queue Manager hin.
          </p>
        </div>
      </section>
    </main>
  )
}

export default App
