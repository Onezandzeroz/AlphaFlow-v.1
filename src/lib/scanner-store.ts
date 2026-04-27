import { create } from 'zustand';

interface ScannerState {
  /** When true, the PosteringerPage should open the add-transaction dialog
   *  and the ReceiptScanner inside it automatically. */
  pendingScan: boolean;
  /** Request that the cam scanner be opened on next navigation to transactions. */
  requestScan: () => void;
  /** Called by PosteringerPage once it has consumed the pending request. */
  consumeScan: () => void;
}

export const useScannerStore = create<ScannerState>((set) => ({
  pendingScan: false,
  requestScan: () => set({ pendingScan: true }),
  consumeScan: () => set({ pendingScan: false }),
}));
