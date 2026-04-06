import { Table, Key, Hash, Type, Link2, Plus, Trash2, Settings2 } from 'lucide-react';

export type ColumnType = 'string' | 'number' | 'boolean' | 'date' | 'uuid' | 'json';

export interface Column {
  id: string;
  name: string;
  type: ColumnType;
  isPrimaryKey: boolean;
  isForeignKey?: boolean;
  references?: {
    tableId: string;
    columnId: string;
  };
}

export interface TableData {
  id: string;
  name: string;
  columns: Column[];
  position: { x: number; y: number };
}

export interface DatabaseSchema {
  tables: TableData[];
}
