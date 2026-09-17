import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getVapidPublicKey } from "@/lib/push-config";
import Header from "@/components/Header";
import PushNotificationControl from "@/components/PushNotificationControl";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="spl-shell">
      <Header user={user} />

      <main className="spl-main">
        <PushNotificationControl vapidPublicKey={getVapidPublicKey()} />
      </main>

      <footer className="spl-footer">
        <Link href="/list" className="spl-link-muted">
          <i className="fa-solid fa-basket-shopping" aria-hidden="true" />
          Back to list
        </Link>
      </footer>
    </div>
  );
}
