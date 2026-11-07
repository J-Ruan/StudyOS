import { registerPlugin } from '@capacitor/core';
export const DeviceTools = registerPlugin<{
  configureChannels(): Promise<void>;
  setStatusExpiry(options: { id: number; at: number }): Promise<void>;
  saveDocument(options: { name: string; data: string }): Promise<{ saved: boolean }>;
}>('StudyDevice');
