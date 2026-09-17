import { listUsers } from "@/lib/users";
import LoginForm from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const users = listUsers();

  return (
    <div className="spl-login-wrap">
      <div className="spl-login-card">
        <div className="spl-login-title">
          <i className="fa-solid fa-basket-shopping" aria-hidden="true" />
          Shoply
        </div>
        <div className="spl-login-sub">Your household shopping list.</div>

        {users.length === 0 ? (
          <div className="spl-error">
            No accounts have been set up yet. Check the <code>ADMIN_NAMES</code> and <code>MEMBER_NAMES</code> settings, then restart the container.
          </div>
        ) : (
          <LoginForm users={users} />
        )}
      </div>
    </div>
  );
}
