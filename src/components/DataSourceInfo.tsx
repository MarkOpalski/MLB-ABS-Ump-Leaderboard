import { useEffect, useState } from 'react';
import { supabase, type SyncLog } from '../lib/supabase';
import { RefreshCw, Database, CheckCircle2, AlertCircle } from 'lucide-react';

export function DataSourceInfo() {
  const [lastSync, setLastSync] = useState<SyncLog | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    loadLastSync();
  }, []);

  const loadLastSync = async () => {
    const { data: source } = await supabase
      .from('data_sources')
      .select('last_successful_sync')
      .eq('name', 'MLB Stats API')
      .maybeSingle();

    if (source?.last_successful_sync) {
      setLastSyncTime(source.last_successful_sync);
    }

    const { data: log } = await supabase
      .from('sync_logs')
      .select('*')
      .order('sync_started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (log) setLastSync(log);
  };

  const triggerSync = async () => {
    setSyncing(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      await fetch(`${supabaseUrl}/functions/v1/orchestrate-daily-sync`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
      });

      await loadLastSync();
    } catch (error) {
      console.error('Sync error:', error);
    } finally {
      setSyncing(false);
    }
  };

  const formatTimestamp = (ts: string) => {
    const date = new Date(ts);
    const diffMs = Date.now() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  const syncOk = lastSync?.status === 'success' || lastSync?.status === 'partial';

  return (
    <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-800">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database size={14} className="text-slate-400" />
          <span className="text-slate-400 text-xs font-semibold">MLB Stats API</span>
          {lastSync && (
            syncOk
              ? <CheckCircle2 size={12} className="text-green-400" />
              : <AlertCircle size={12} className="text-yellow-400" />
          )}
          {lastSyncTime && (
            <span className="text-slate-500 text-xs">{formatTimestamp(lastSyncTime)}</span>
          )}
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

      {lastSync?.records_added != null && lastSync.records_added > 0 && (
        <p className="text-slate-600 text-xs mt-1.5">
          Last sync: {lastSync.records_added} new challenges added
        </p>
      )}
    </div>
  );
}
