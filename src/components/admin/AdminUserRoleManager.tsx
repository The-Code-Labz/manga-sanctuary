import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { UserPlus, ShieldCheck, ShieldX, Loader2 } from "lucide-react";

export default function AdminUserRoleManager() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const qc = useQueryClient();

  const { data: adminUsers = [], isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data: roles, error } = await supabase
        .from("user_roles")
        .select("id, user_id, role");
      if (error) throw error;
      const userIds = roles.map((r: any) => r.user_id);
      if (!userIds.length) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username, email")
        .in("id", userIds);
      return roles.map((r: any) => ({
        ...r,
        profile: profiles?.find((p: any) => p.id === r.user_id),
      }));
    },
  });

  const addAdmin = async () => {
    if (!email.trim()) return;
    setLoading(true);
    const { data: profile, error: pErr } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email.trim())
      .maybeSingle();
    if (pErr) { toast.error(pErr.message); setLoading(false); return; }
    if (!profile) { toast.error("No user found with that email"); setLoading(false); return; }

    const { data: existing } = await supabase
      .from("user_roles")
      .select("id")
      .eq("user_id", profile.id)
      .eq("role", "admin")
      .maybeSingle();
    if (existing) { toast.info("User is already an admin"); setLoading(false); return; }

    const { error } = await supabase
      .from("user_roles")
      .insert({ user_id: profile.id, role: "admin" });
    if (error) { toast.error(error.message); setLoading(false); return; }
    toast.success("Admin role granted!");
    setEmail("");
    qc.invalidateQueries({ queryKey: ["admin-users"] });
    setLoading(false);
  };

  const removeRole = async (roleId: string) => {
    if (!confirm("Remove this admin role?")) return;
    const { error } = await supabase.from("user_roles").delete().eq("id", roleId);
    if (error) { toast.error(error.message); return; }
    toast.success("Role removed");
    qc.invalidateQueries({ queryKey: ["admin-users"] });
  };

  return (
    <div className="space-y-4 max-w-lg">
      <div className="flex gap-2">
        <Input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="User email to grant admin"
          className="bg-card border-border/50 focus:border-primary/50"
          type="email"
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addAdmin())}
        />
        <Button onClick={addAdmin} disabled={loading} className="gap-1.5 shrink-0 gradient-neon border-0 text-white">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          Add Admin
        </Button>
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : adminUsers.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No admin/moderator users found.</p>
      ) : (
        <div className="space-y-1">
          {adminUsers.map((u: any) => (
            <div key={u.id} className="flex items-center justify-between px-4 py-2.5 rounded-lg bg-card border border-border/20 hover:border-primary/20 transition-colors">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <div>
                  <span className="text-sm font-medium">{u.profile?.username || "Unknown"}</span>
                  <span className="text-xs text-muted-foreground ml-2">{u.profile?.email}</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-primary/10 text-primary font-semibold capitalize">{u.role}</span>
              </div>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => removeRole(u.id)}>
                <ShieldX className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}