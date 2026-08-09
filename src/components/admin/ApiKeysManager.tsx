import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { mangaApiAdminFetch, MangaApiAdminError } from "@/lib/manga-api-admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { KeyRound, Plus, Trash2, Copy, Check, ShieldAlert, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ApiKeyRow {
  id: string;
  name: string;
  scope: "read" | "write" | "admin";
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

const SCOPE_STYLE: Record<string, string> = {
  read: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  write: "bg-golden/10 text-golden border-golden/20",
  admin: "bg-destructive/10 text-destructive border-destructive/20",
};

export default function ApiKeysManager() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"read" | "write" | "admin">("read");
  const [creating, setCreating] = useState(false);
  const [freshKey, setFreshKey] = useState<{ key: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["manga-api-keys"],
    queryFn: () => mangaApiAdminFetch<{ keys: ApiKeyRow[] }>("/admin/keys"),
  });
  const keys = data?.keys ?? [];

  const handleCreate = async () => {
    if (!name.trim()) { toast.error("Give the key a name"); return; }
    setCreating(true);
    try {
      const res = await mangaApiAdminFetch<{ key: string; name: string }>("/admin/keys", {
        method: "POST",
        body: { name: name.trim(), scope },
      });
      setFreshKey({ key: res.key, name: res.name });
      setName("");
      setScope("read");
      qc.invalidateQueries({ queryKey: ["manga-api-keys"] });
    } catch (e) {
      toast.error(e instanceof MangaApiAdminError ? e.message : "Failed to create key");
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string, keyName: string) => {
    if (!confirm(`Revoke API key "${keyName}"? Any caller using it will immediately get 401s.`)) return;
    try {
      await mangaApiAdminFetch(`/admin/keys/${id}`, { method: "DELETE" });
      toast.success("Key revoked");
      qc.invalidateQueries({ queryKey: ["manga-api-keys"] });
    } catch (e) {
      toast.error(e instanceof MangaApiAdminError ? e.message : "Failed to revoke key");
    }
  };

  const copyKey = () => {
    if (!freshKey) return;
    navigator.clipboard.writeText(freshKey.key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {freshKey && (
        <Alert className="border-golden/30 bg-golden/5">
          <ShieldAlert className="h-4 w-4 text-golden" />
          <AlertDescription className="space-y-2">
            <p className="text-sm font-semibold text-golden">
              New key "{freshKey.name}" created — copy it now, it will never be shown again.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 rounded-lg bg-background/80 border border-border/40 text-xs font-mono break-all">
                {freshKey.key}
              </code>
              <Button size="sm" variant="outline" onClick={copyKey} className="shrink-0 gap-1.5">
                {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setFreshKey(null)} className="shrink-0">
                Dismiss
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className="p-4 rounded-xl bg-card/50 border border-border/30 space-y-3">
        <h3 className="text-sm font-bold flex items-center gap-2">
          <Plus className="h-4 w-4 text-primary" /> Generate a new key
        </h3>
        <div className="flex flex-wrap gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Key name (e.g. Saya's agent)"
            className="bg-card border-border/50 focus:border-primary/50 flex-1 min-w-[200px]"
            onKeyDown={(e) => e.key === "Enter" && !creating && handleCreate()}
          />
          <Select value={scope} onValueChange={(v) => setScope(v as typeof scope)}>
            <SelectTrigger className="w-[140px] bg-card border-border/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="read">read</SelectItem>
              <SelectItem value="write">write</SelectItem>
              <SelectItem value="admin">admin</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleCreate} disabled={creating} className="gap-1.5 gradient-neon border-0 text-white shrink-0">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            Generate
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          <strong>read</strong> — GET only. <strong>write</strong> — create/update novels &amp; chapters. <strong>admin</strong> — delete novels too.
        </p>
      </div>

      <div className="rounded-xl border border-border/30 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-border/30">
              <TableHead>Name</TableHead>
              <TableHead>Scope</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Last used</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
            )}
            {!isLoading && keys.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No API keys yet.</TableCell></TableRow>
            )}
            {keys.map((k) => (
              <TableRow key={k.id} className="border-border/20">
                <TableCell className="font-medium">{k.name}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={SCOPE_STYLE[k.scope]}>{k.scope}</Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(k.created_at), { addSuffix: true })}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {k.last_used_at ? formatDistanceToNow(new Date(k.last_used_at), { addSuffix: true }) : "Never"}
                </TableCell>
                <TableCell>
                  {k.revoked_at ? (
                    <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">Revoked</Badge>
                  ) : (
                    <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/20">Active</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {!k.revoked_at && (
                    <Button
                      size="sm" variant="ghost"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => handleRevoke(k.id, k.name)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
