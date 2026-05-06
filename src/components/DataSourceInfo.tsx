import { useEffect, useState } from 'react';
import { supabase, type DataSource, type SyncLog } from '../lib/supabase';
import { RefreshCw, Database, CheckCircle2, AlertCircle, MinusCircle } from 'lucide-react';

export function DataSourceInfo() {
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [latestSync, setLatestSync] = useState<SyncLog | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    loadDataSources();
    loadLatestSync();
  }, []);

  const loadDataSources = async () => {
    const { data } = await supabase
      .from('data_sources')
      .select('*')
      .order('priority');

    if (data) {
      setDataSources(data);
    }
  };

  const loadLatestSync = async () => {
    const { data } = await supabase
      .from('sync_logs')
      .select('*')
      .order('sync_started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      setLatestSync(data);
    }
  };

  const triggerSync = async () => {
    setSyncing(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const response = await fetch(`${supabaseUrl}/functions/v1/orchestrate-daily-sync`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();

      if (result.success) {
        await loadDataSources();
        await loadLatestSync();
      } else {
        console.error('Sync failed:', result.error);
      }
    } catch (error) {
      console.error('Error triggering sync:', error);
    } finally {
      setSyncing(false);
    }
  };

  const formatTimestamp = (timestamp: string | undefined) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const primaryActiveSource = dataSources.find(ds => ds.is_active && ds.last_successful_sync);

  return (
    <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-800">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Database size={14} className="text-slate-400" />
          <span className="text-slate-400 text-xs font-semibold">Data Sources</span>
        </div>
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="text-slate-500 hover:text-slate-300 text-xs transition-colors"
        >
          {showDetails ? 'Hide' : 'Show'}
        </button>
      </div>

      {showDetails && (
        <div className="space-y-2 mb-3">
          {dataSources.map(source => (
            <div
              key={source.id}
              className={`rounded p-2 border ${
                source.is_active
                  ? 'bg-slate-800/50 border-slate-700/50'
                  : 'bg-slate-900/30 border-slate-800/30'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {!source.is_active ? (
                    <MinusCircle size={12} className="text-slate-600" />
                  ) : source.consecutive_failures === 0 && source.last_successful_sync ? (
                    <CheckCircle2 size={12} className="text-green-400" />
                  ) : (
                    <AlertCircle size={12} className="text-yellow-400" />
                  )}
                  <span className={`text-xs font-medium ${source.is_active ? 'text-white' : 'text-slate-600'}`}>
                    {source.name}
                  </span>
                  {!source.is_active && (
                    <span className="text-xs text-slate-600 italic">not configured</span>
                  )}
                </div>
                {source.is_active && (
                  <span className="text-slate-400 text-xs">
                    {formatTimestamp(source.last_successful_sync)}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="text-xs">
          <span className="text-slate-500">Last sync: </span>
          <span className="text-slate-300">
            {primaryActiveSource ? formatTimestamp(primaryActiveSource.last_successful_sync) : 'Never'}
          </span>
        </div>
        <button
          onClick={triggerSync}
          disabled={syncing}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-all ${
            syncing
              ? 'bg-slate-700/50 text-slate-500 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
        >
          <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing...' : 'Sync Now'}
        </button>
      </div>

      {latestSync && latestSync.status === 'success' && (
        <div className="mt-2 pt-2 border-t border-slate-800">
          <div className="text-xs text-slate-400">
            Last sync added {latestSync.records_added} new records, updated {latestSync.records_updated}
          </div>
        </div>
      )}
    </div>
  );
}
