import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Table as TableIcon, Key, Hash, Type, Calendar, ToggleLeft, Database, Link2 } from 'lucide-react';
import { TableData, ColumnType } from '../types';

const TypeIcon = ({ type }: { type: ColumnType }) => {
  switch (type) {
    case 'number': return <Hash className="w-3 h-3 text-blue-500" />;
    case 'boolean': return <ToggleLeft className="w-3 h-3 text-green-500" />;
    case 'date': return <Calendar className="w-3 h-3 text-purple-500" />;
    case 'string': return <Type className="w-3 h-3 text-slate-500" />;
    default: return <Database className="w-3 h-3 text-slate-400" />;
  }
};

const TableNode = ({ data }: NodeProps<TableData>) => {
  return (
    <div className="react-flow__node-table group">
      <div className="bg-slate-50 border-b border-slate-200 px-3 py-2 flex items-center gap-2">
        <TableIcon className="w-4 h-4 text-slate-600" />
        <span className="font-semibold text-slate-800 text-sm">{data.name}</span>
      </div>
      <div className="py-1">
        {data.columns.map((column) => (
          <div key={column.id} className="relative px-3 py-1.5 flex items-center justify-between hover:bg-slate-50 transition-colors">
            <Handle
              type="target"
              position={Position.Left}
              id={`target-${column.id}`}
              className="!bg-slate-300 !border-white !w-1.5 !h-1.5"
            />
            <div className="flex items-center gap-2">
              {column.isPrimaryKey ? (
                <Key className="w-3 h-3 text-amber-500" />
              ) : column.isForeignKey ? (
                <Link2 className="w-3 h-3 text-blue-400" />
              ) : (
                <TypeIcon type={column.type} />
              )}
              <span className="text-xs text-slate-700 font-medium">{column.name}</span>
            </div>
            <span className="text-[10px] text-slate-400 uppercase font-mono">{column.type}</span>
            <Handle
              type="source"
              position={Position.Right}
              id={`source-${column.id}`}
              className="!bg-slate-300 !border-white !w-1.5 !h-1.5"
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default memo(TableNode);
