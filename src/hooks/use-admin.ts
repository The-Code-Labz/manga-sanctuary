import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useIsAdmin() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["is-admin", user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { data, error } = await (supabase.rpc as any)("has_role", {
        _user_id: user.id,
        _role: "admin",
      });
      if (error) return false;
      return !!data;
    },
    enabled: !!user,
  });
}
