import { useQuery } from "@tanstack/react-query";
import { mangaApiAdminFetch } from "@/lib/manga-api-admin";
import CoverRehostBackfill from "@/components/admin/CoverRehostBackfill";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Activity, AlertTriangle, Clock, KeyRound, Sparkles } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

interface UsageResponse {
  total_all_time: number;
  total_in_window: number;
  window_days: number;
  errors_4xx: number;
  errors_5xx: number;
  daily: { date: string; total: number; errors: number }[];
  top_endpoints: { endpoint: string; count: number; avg_duration_ms: number | null }[];
  key_usage: { api_key_id: string | null; name: string; count: number; last_seen: string }[];
  recent: {
    method: string; path: string; status_code: number; duration_ms: number | null;
    created_at: string; key_name: string | null;
  }[];
}

function statusColor(status: number): string {
  if (status >= 500) return "bg-destructive/10 text-destructive border-destructive/20";
  if (status >= 400) return "bg-golden/10 text-golden border-golden/20";
  return "bg-green-500/10 text-green-400 border-green-500/20";
}

const STAT_CARDS: { key: keyof UsageResponse | "error_rate"; label: string; icon: React.ElementType; color: string }[] = [
  { key: "total_all_time", label: "Total Requests (all time)", icon: Sparkles, color: "text-primary" },
  { key: "total_in_window", label: "Requests (window)", icon: Activity, color: "text-cyan-400" },
  { key: "error_rate", label: "Error Rate (window)", icon: AlertTriangle, color: "text-golden" },
];

export default function ApiDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["manga-api-usage"],
    queryFn: () => mangaApiAdminFetch<UsageResponse>("/admin/usage", { query: { days: 14 } }),
    refetchInterval: 60_000,
  });

  if (isLoading || !data) {
    return <p className="text-sm text-muted-foreground text-center py-12">Loading activity…</p>;
  }

  const errorRate = data.total_in_window > 0
    ? (((data.errors_4xx + data.errors_5xx) / data.total_in_window) * 100).toFixed(1) + "%"
    : "0%";

  return (
    <div className="space-y-6">
      <CoverRehostBackfill />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-xl bg-card/50 border border-border/30 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10"><Sparkles className="h-5 w-5 text-primary" /></div>
          <div>
            <p className="text-xl font-extrabold">{data.total_all_time.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Total requests (all time)</p>
          </div>
        </div>
        <div className="p-4 rounded-xl bg-card/50 border border-border/30 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-cyan-500/10"><Activity className="h-5 w-5 text-cyan-400" /></div>
          <div>
            <p className="text-xl font-extrabold">{data.total_in_window.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Last {data.window_days} days</p>
          </div>
        </div>
        <div className="p-4 rounded-xl bg-card/50 border border-border/30 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-golden/10"><AlertTriangle className="h-5 w-5 text-golden" /></div>
          <div>
            <p className="text-xl font-extrabold">{errorRate}</p>
            <p className="text-xs text-muted-foreground">{data.errors_4xx} client · {data.errors_5xx} server errors</p>
          </div>
        </div>
      </div>

      <div className="p-4 rounded-xl bg-card/50 border border-border/30">
        <h3 className="text-sm font-bold mb-3 flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /> Requests per day</h3>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.daily}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d: string) => d.slice(5)} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
              />
              <Bar dataKey="total" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} name="Requests" />
              <Bar dataKey="errors" fill="hsl(var(--destructive))" radius={[3, 3, 0, 0]} name="Errors" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-border/30 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border/30 text-sm font-bold flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-primary" /> Top endpoints
          </div>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-border/30">
                <TableHead>Endpoint</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Avg ms</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.top_endpoints.length === 0 && (
                <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">No traffic yet.</TableCell></TableRow>
              )}
              {data.top_endpoints.map((e) => (
                <TableRow key={e.endpoint} className="border-border/20">
                  <TableCell className="font-mono text-xs">{e.endpoint}</TableCell>
                  <TableCell className="text-right">{e.count}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{e.avg_duration_ms ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="rounded-xl border border-border/30 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border/30 text-sm font-bold flex items-center gap-2">
            <KeyRound className="h-3.5 w-3.5 text-primary" /> Usage by key
          </div>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-border/30">
                <TableHead>Key</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Last seen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.key_usage.length === 0 && (
                <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">No traffic yet.</TableCell></TableRow>
              )}
              {data.key_usage.map((k) => (
                <TableRow key={k.api_key_id ?? "none"} className="border-border/20">
                  <TableCell className="text-xs">{k.name}</TableCell>
                  <TableCell className="text-right">{k.count}</TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(k.last_seen), { addSuffix: true })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="rounded-xl border border-border/30 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border/30 text-sm font-bold">Recent activity</div>
        <div className="max-h-[420px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-border/30">
                <TableHead>Time</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Path</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Key</TableHead>
                <TableHead className="text-right">ms</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.recent.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No requests logged yet.</TableCell></TableRow>
              )}
              {data.recent.map((r, i) => (
                <TableRow key={i} className="border-border/20">
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                  </TableCell>
                  <TableCell className="text-xs font-mono">{r.method}</TableCell>
                  <TableCell className="text-xs font-mono truncate max-w-[220px]">{r.path}</TableCell>
                  <TableCell><Badge variant="outline" className={statusColor(r.status_code)}>{r.status_code}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.key_name ?? "—"}</TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">{r.duration_ms ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
