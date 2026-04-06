import React, { useState, useCallback, useMemo } from 'react';
import ReactFlow, { 
  Background, 
  Controls, 
  MiniMap, 
  useNodesState, 
  useEdgesState, 
  addEdge,
  Connection,
  Edge,
  MarkerType,
  Panel,
  Node
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Database, Plus, Download, X, Edit3, Key, RefreshCw, LogIn, AlertCircle, Flame, Globe } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, limit, query } from 'firebase/firestore';
import TableNode from './components/TableNode';
import { TableData, Column, ColumnType } from './types';

const nodeTypes = {
  table: TableNode,
};

type ConnectionMode = 'supabase' | 'firebase';

export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const selectedTable = useMemo(() => {
    if (!selectedNodeId) return null;
    const node = nodes.find(n => n.id === selectedNodeId);
    return node ? (node.data as TableData) : null;
  }, [selectedNodeId, nodes]);

  // Connection State
  const [showConnect, setShowConnect] = useState(true);
  const [mode, setMode] = useState<ConnectionMode>('supabase');
  
  // Supabase Credentials
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKey, setSupabaseKey] = useState('');

  // Firebase Credentials
  const [firebaseConfig, setFirebaseConfig] = useState('');

  const fetchSupabaseSchema = async () => {
    if (!supabaseUrl || !supabaseKey) {
      setError('Please provide both URL and Key');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      // Try RPC first for detailed schema (includes real PK info)
      const { data, error: fetchError } = await supabase.rpc('get_schema_info');
      
      // If RPC fails with "function not found", try the built-in OpenAPI fallback
      if (fetchError && (fetchError.code === 'PGRST202' || fetchError.message?.includes('get_schema_info'))) {
        console.log('RPC not found, falling back to OpenAPI spec...');
        const response = await fetch(`${supabaseUrl}/rest/v1/`, {
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`
          }
        });
        
        if (response.ok) {
          const spec = await response.json();
          if (spec.definitions) {
            const tables: TableData[] = Object.entries(spec.definitions).map(([name, definition]: [string, any], index: number) => ({
              id: name,
              name: name,
              position: { x: (index % 3) * 350, y: Math.floor(index / 3) * 350 },
              columns: Object.entries(definition.properties || {}).map(([colName, colDef]: [string, any]) => ({
                id: `${name}_${colName}`,
                name: colName,
                type: (colDef.format || colDef.type || 'text') as ColumnType,
                isPrimaryKey: (definition.required || []).includes(colName) || colName === 'id',
              })),
            }));

            setNodes(tables.map(t => ({
              id: t.id,
              type: 'table',
              position: t.position,
              data: t,
            })));
            
            setShowConnect(false);
            return;
          }
        }
      }
      
      if (fetchError) {
        throw new Error(`Failed to fetch schema: ${fetchError.message}. To get full schema details including primary keys, please run the SQL script provided below in your Supabase SQL Editor.`);
      }

      if (data) {
        const tables: TableData[] = (data.tables || []).map((t: any, index: number) => ({
          id: t.table_name,
          name: t.table_name,
          position: { x: (index % 3) * 350, y: Math.floor(index / 3) * 350 },
          columns: t.columns.map((c: any) => ({
            id: `${t.table_name}_${c.column_name}`,
            name: c.column_name,
            type: c.data_type as ColumnType,
            isPrimaryKey: c.is_primary_key,
            isForeignKey: c.is_foreign_key,
          })),
        }));

        setNodes(tables.map(t => ({
          id: t.id,
          type: 'table',
          position: t.position,
          data: t,
        })));

        // Create edges from relationships
        if (data.relationships) {
          const newEdges: Edge[] = data.relationships.map((r: any, index: number) => ({
            id: `e-${r.source_table}-${r.target_table}-${index}`,
            source: r.source_table,
            target: r.target_table,
            sourceHandle: `source-${r.source_table}_${r.source_column}`,
            targetHandle: `target-${r.target_table}_${r.target_column}`,
            animated: true,
            style: { stroke: '#94a3b8', strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' }
          }));
          setEdges(newEdges);
        }
        
        setShowConnect(false);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchFirebaseSchema = async () => {
    if (!firebaseConfig) {
      setError('Please provide your Firebase config JSON');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const config = JSON.parse(firebaseConfig);
      const app = initializeApp(config);
      const db = getFirestore(app);
      
      // Note: Firestore doesn't have a direct "list collections" API in the web SDK
      // without knowing the names. For this visualizer, we'll ask the user to provide
      // a comma-separated list of collection names or we can try a few common ones.
      // For now, let's assume they might provide a list or we use a placeholder.
      setError('Firestore visualization requires a list of collection names as the Web SDK cannot list root collections directly. Please use Supabase for full SQL schema visualization.');
      
    } catch (err: any) {
      setError(`Invalid JSON config: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ 
      ...params, 
      animated: true,
      style: { stroke: '#94a3b8', strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' }
    }, eds)),
    [setEdges]
  );

  const onNodeClick = (_: any, node: Node) => {
    setSelectedNodeId(node.id);
  };

  const exportToSQL = () => {
    let sql = '-- Generated by Database Visualizer\n\n';
    nodes.forEach(node => {
      const table = node.data as TableData;
      sql += `CREATE TABLE ${table.name} (\n`;
      const cols = table.columns.map(c => {
        let line = `  ${c.name} ${c.type.toUpperCase()}`;
        if (c.isPrimaryKey) line += ' PRIMARY KEY';
        return line;
      });
      sql += cols.join(',\n');
      sql += '\n);\n\n';
    });
    
    const blob = new Blob([sql], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'schema.sql';
    a.click();
  };

  return (
    <div className="w-full h-screen bg-slate-50 flex flex-col font-sans overflow-hidden">
      {/* Header */}
      <header className="h-14 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0 shadow-sm z-20">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-1.5 rounded-lg">
            <Database className="w-5 h-5 text-white" />
          </div>
          <h1 className="font-bold text-slate-800 tracking-tight">Database Visualizer</h1>
        </div>
        
        <div className="flex items-center gap-2">
          {!showConnect && (
            <button 
              onClick={() => setShowConnect(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-md transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Reconnect
            </button>
          )}
          <div className="w-px h-6 bg-slate-200 mx-2" />
          <button 
            onClick={exportToSQL}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors shadow-sm"
          >
            <Download className="w-4 h-4" />
            Export SQL
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        {/* Connection Overlay */}
        {showConnect && (
          <div className="absolute inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-6">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-slate-200">
              <div className="bg-blue-600 p-6 text-white">
                <div className="flex items-center gap-3 mb-2">
                  <Database className="w-6 h-6" />
                  <h2 className="text-xl font-bold">Connect Database</h2>
                </div>
                <p className="text-blue-100 text-sm">Visualize your existing database tables in real-time.</p>
              </div>
              
              <div className="p-6 space-y-4">
                {/* Mode Selector */}
                <div className="flex p-1 bg-slate-100 rounded-xl">
                  <button 
                    onClick={() => setMode('supabase')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all ${mode === 'supabase' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    <Globe className="w-3.5 h-3.5" />
                    Supabase
                  </button>
                  <button 
                    onClick={() => setMode('firebase')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all ${mode === 'firebase' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    <Flame className="w-3.5 h-3.5" />
                    Firebase
                  </button>
                </div>

                {error && (
                  <div className="p-3 bg-red-50 border border-red-100 rounded-lg flex items-start gap-3 text-red-600 text-xs">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                {mode === 'supabase' ? (
                  <>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Supabase URL</label>
                      <input 
                        type="text" 
                        placeholder="https://your-project.supabase.co"
                        value={supabaseUrl}
                        onChange={(e) => setSupabaseUrl(e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Anon / Service Role Key</label>
                      <input 
                        type="password" 
                        placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                        value={supabaseKey}
                        onChange={(e) => setSupabaseKey(e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                      />
                    </div>
                  </>
                ) : (
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Firebase Config JSON</label>
                    <textarea 
                      placeholder='{ "apiKey": "...", "authDomain": "...", ... }'
                      value={firebaseConfig}
                      onChange={(e) => setFirebaseConfig(e.target.value)}
                      rows={4}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                    />
                  </div>
                )}

                <div className="pt-2">
                  <button 
                    onClick={mode === 'supabase' ? fetchSupabaseSchema : fetchFirebaseSchema}
                    disabled={isLoading}
                    className={`w-full py-3 text-white font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 ${mode === 'supabase' ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20' : 'bg-orange-600 hover:bg-orange-700 shadow-orange-500/20'}`}
                  >
                    {isLoading ? (
                      <RefreshCw className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <LogIn className="w-5 h-5" />
                        Connect & Visualize
                      </>
                    )}
                  </button>
                </div>

                {mode === 'supabase' && (
                  <div className="bg-amber-50 p-3 rounded-lg border border-amber-100">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">SQL Setup Required</p>
                      <button 
                        onClick={() => {
                          const sql = `CREATE OR REPLACE FUNCTION get_schema_info()
RETURNS json AS $$
DECLARE
    tables_json json;
    relationships_json json;
BEGIN
    SELECT json_agg(t) INTO tables_json FROM (
      SELECT table_name, (
        SELECT json_agg(c) FROM (
          SELECT column_name, data_type, 
          EXISTS (SELECT 1 FROM information_schema.key_column_usage kcu JOIN information_schema.table_constraints tc ON kcu.constraint_name = tc.constraint_name WHERE tc.table_name = cols.table_name AND kcu.column_name = cols.column_name AND tc.constraint_type = 'PRIMARY KEY') as is_primary_key,
          EXISTS (SELECT 1 FROM information_schema.key_column_usage kcu JOIN information_schema.table_constraints tc ON kcu.constraint_name = tc.constraint_name WHERE tc.table_name = cols.table_name AND kcu.column_name = cols.column_name AND tc.constraint_type = 'FOREIGN KEY') as is_foreign_key
          FROM information_schema.columns cols WHERE table_name = tables.table_name
        ) c
      ) as columns
      FROM information_schema.tables tables WHERE table_schema = 'public'
    ) t;

    SELECT json_agg(r) INTO relationships_json FROM (
        SELECT
            tc.table_name AS source_table,
            kcu.column_name AS source_column,
            ccu.table_name AS target_table,
            ccu.column_name AS target_column
        FROM
            information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu
              ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage AS ccu
              ON ccu.constraint_name = tc.constraint_name
              AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
    ) r;

    RETURN json_build_object(
        'tables', tables_json,
        'relationships', COALESCE(relationships_json, '[]'::json)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;`;
                          navigator.clipboard.writeText(sql);
                        }}
                        className="text-[9px] bg-amber-200 hover:bg-amber-300 text-amber-800 px-1.5 py-0.5 rounded font-bold transition-colors"
                      >
                        Copy SQL
                      </button>
                    </div>
                    <p className="text-[10px] text-amber-700 leading-relaxed">
                      To fetch full schema details, run this function in your Supabase SQL Editor:
                      <code className="block mt-1 p-1 bg-amber-100 rounded text-[9px] font-mono whitespace-pre overflow-x-auto">
                        {`CREATE OR REPLACE FUNCTION get_schema_info() ...`}
                      </code>
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Main Workspace */}
        <div className="flex-1 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={() => setSelectedNodeId(null)}
            nodeTypes={nodeTypes}
            fitView
            className="bg-slate-50"
          >
            <Background color="#cbd5e1" gap={20} />
            <Controls className="!bg-white !border-slate-200 !shadow-sm" />
            <MiniMap 
              nodeColor="#e2e8f0"
              maskColor="rgba(241, 245, 249, 0.7)"
              className="!bg-white !border-slate-200 !shadow-sm"
            />
            
            <Panel position="top-left" className="bg-white/80 backdrop-blur-sm p-3 rounded-lg border border-slate-200 shadow-sm m-4">
              <div className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Instructions</div>
              <ul className="text-xs text-slate-600 space-y-1">
                <li>• Connect to your project</li>
                <li>• Drag tables to organize your view</li>
                <li>• Visualize relationships between tables</li>
              </ul>
            </Panel>
          </ReactFlow>
        </div>

        {/* Sidebar */}
        {selectedTable && (
          <aside className="w-80 bg-white border-l border-slate-200 flex flex-col shadow-xl z-10">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-blue-600" />
                <h2 className="font-bold text-slate-800">Table Details</h2>
              </div>
              <button 
                onClick={() => setSelectedNodeId(null)}
                className="p-1 hover:bg-slate-100 rounded-full text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {/* Table Name */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Table Name</label>
                <div className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-sm font-medium text-slate-700">
                  {selectedTable.name}
                </div>
              </div>

              {/* Columns */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Columns</label>
                <div className="space-y-2">
                  {selectedTable.columns.map((col) => (
                    <div key={col.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {col.isPrimaryKey && <Key className="w-3 h-3 text-amber-500" />}
                        <span className="text-sm font-medium text-slate-700">{col.name}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 uppercase font-mono">{col.type}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200">
              <button 
                onClick={() => setSelectedNodeId(null)}
                className="w-full py-2 bg-white border border-slate-200 rounded-md text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Close Details
              </button>
            </div>
          </aside>
        )}
      </div>

      {/* Footer / Status Bar */}
      <footer className="h-8 bg-white border-t border-slate-200 px-4 flex items-center justify-between text-[10px] text-slate-400 font-mono uppercase tracking-widest z-20">
        <div className="flex items-center gap-4">
          <span>Tables: {nodes.length}</span>
          <span>Relations: {edges.length}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className={`w-1.5 h-1.5 rounded-full ${nodes.length > 0 ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`} />
          {nodes.length > 0 ? 'Connected' : 'Disconnected'}
        </div>
      </footer>
    </div>
  );
}




