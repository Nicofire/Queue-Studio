import { createTabId, type TabName } from './tabs';

type TabButtonProps = {
  tab: TabName;
  isActive: boolean;
  onSelect: (tab: TabName) => void;
};

export function TabButton({ tab, isActive, onSelect }: TabButtonProps) {
  const tabId = createTabId(tab);

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      aria-controls={`${tabId}-panel`}
      id={`${tabId}-tab`}
      className={isActive ? 'tab-button is-active' : 'tab-button'}
      onClick={() => onSelect(tab)}
    >
      {tab}
    </button>
  );
}
