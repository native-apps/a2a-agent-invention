// Type declaration for A2A Agent Settings component (lazy-loaded)
declare module "@/inventions/a2a-agent/settings/A2aAgentSettings" {
  import type { ComponentType } from "react";
  
  interface InventionConfig {
    id: string;
    name: string;
    description: string;
    type: string;
    version: string;
    enabled: boolean;
    installedAt: string;
    updatedAt: string;
    projectIds: string[];
    settings: Record<string, unknown>;
    icon?: string;
  }
  
  const A2aAgentSettings: ComponentType<{
    invention: InventionConfig;
    onUpdate: (updates: Partial<InventionConfig>) => void;
  }>;
  
  export default A2aAgentSettings;
}
