import { Suspense } from "react";
import AuthHub from "@/components/auth-hub";

function AuthHubFallback() {
  return (
    <main className="page">
      <p className="subtext">Loading account…</p>
    </main>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={<AuthHubFallback />}>
      <AuthHub />
    </Suspense>
  );
}
