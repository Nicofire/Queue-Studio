import { useState } from 'react'
import './App.css'

const tabs = ['List View', 'Tile View', 'Editor', 'Settings'] as const

type TabName = (typeof tabs)[number]

function App() {
  const [activeTab, setActiveTab] = useState<TabName>('List View')

  return (
    <main className="app-shell">
      <header className="top-bar" aria-label="Main navigation tabs">
        <nav className="tab-list" role="tablist" aria-label="Queue manager views">
          {tabs.map((tab) => {
            const isActive = tab === activeTab

            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`${tab.toLowerCase().replace(/\s+/g, '-')}-panel`}
                id={`${tab.toLowerCase().replace(/\s+/g, '-')}-tab`}
                className={isActive ? 'tab-button is-active' : 'tab-button'}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            )
          })}
        </nav>
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
