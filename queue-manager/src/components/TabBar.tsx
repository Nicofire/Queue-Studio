import { TabButton } from './TabButton';
import type { TabName } from './tabs';

type TabBarProps = {
  tabs: readonly TabName[];
  activeTab: TabName;
  onTabChange: (tab: TabName) => void;
};

export function TabBar({ tabs, activeTab, onTabChange }: TabBarProps) {
  return (
    <nav className="tab-list" role="tablist" aria-label="Queue manager views">
      {tabs.map((tab) => (
        <TabButton key={tab} tab={tab} isActive={tab === activeTab} onSelect={onTabChange} />
      ))}
    </nav>
  );
}
