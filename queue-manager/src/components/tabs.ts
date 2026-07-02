export const tabs = ['List View', 'Tile View', 'Editor', 'Settings'] as const;

export type TabName = (typeof tabs)[number];

export const createTabId = (tab: TabName) => tab.toLowerCase().replace(/\s+/g, '-');
