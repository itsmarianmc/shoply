
export interface UndoEntry {
  itemId: number;
  itemName: string;
}

declare global {
  interface Window {
    __shoplyUndoStack?: UndoEntry[];
  }
}

export {};