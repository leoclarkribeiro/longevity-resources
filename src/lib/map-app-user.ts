import { User } from "@supabase/supabase-js";
import type { AppUser } from "@/lib/types";

export function mapAppUser(user: User | null): AppUser | null {
  if (!user) {
    return null;
  }
  return {
    id: user.id,
    email: user.email,
    is_anonymous: user.is_anonymous
  };
}
