// components/admin/ui/PermissionGate.jsx
//
// The three things an admin page can know about whether you may be here:
// it is still asking, it could not find out, or the answer is no. Every page
// used to collapse the middle one into the last — a 500 on /api/roles made
// `can()` false for everything, so a signed-in shop owner was told "Access
// denied — your role does not allow viewing customers" when nothing had
// changed except that one request. That is alarming and wrong, and it is
// exactly the failure §27 is about: never leave the user with an
// unexplained failure, and never explain it incorrectly.
//
// It also collapses about thirty hand-written denied blocks that had grown
// five different wordings and layouts ("Access denied", "Admin access
// required", "Your role does not allow viewing customers", a bare sentence
// in a <p>, a full-screen panel with a Back to home button).
//
// Usage:
//   const { can, loading, failed, refresh } = usePermissions();
//   ...
//   <PermissionGate perm="orders" state={{ loading, failed, can, refresh }} what="orders">
//     ...the page...
//   </PermissionGate>
"use client";

import Link from "next/link";
import Button from "@/components/admin/ui/Button";
import EmptyState from "@/components/admin/ui/EmptyState";

export default function PermissionGate({ perm, state, what, signedIn = true, children }) {
  const { loading, failed, can, refresh } = state;

  // Not signed in at all is a different problem from not being allowed, and
  // it has a different fix: sign in, rather than ask an admin for a role.
  if (!signedIn) {
    return (
      <div className="max-w-[1700px] mx-auto px-4 lg:px-8 py-6">
        <div className="admin-card rounded-xl">
          <EmptyState
            icon="lock"
            title="You're signed out"
            description="Sign in with a staff account to use the admin."
          />
          <div className="flex justify-center pb-6">
            <Button as={Link} href="/login">Sign in</Button>
          </div>
        </div>
      </div>
    );
  }

  // Still asking. Render nothing rather than flashing a denial that may be
  // about to turn into the page.
  if (loading) return null;

  if (failed) {
    return (
      <div className="max-w-[1700px] mx-auto px-4 lg:px-8 py-6">
        <div className="admin-card rounded-xl">
          <EmptyState
            icon="warning"
            title="Couldn't check your permissions"
            description="The server didn't answer when we asked what you're allowed to see. Usually a retry is enough; if your session has expired, signing in again will fix it."
          />
          {/* Two causes land here — the server failed, or the session went
              stale and the request came back unauthorised — and the fix is
              different for each, so both are offered rather than guessed at. */}
          <div className="flex justify-center gap-2 pb-6">
            <Button onClick={() => refresh?.()}>Try again</Button>
            <Button as={Link} href="/login" variant="secondary">
              Sign in again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (perm && !can(perm)) {
    return (
      <div className="max-w-[1700px] mx-auto px-4 lg:px-8 py-6">
        <div className="admin-card rounded-xl">
          <EmptyState
            icon="lock"
            title="You don't have access to this"
            description={
              what
                ? `Your role doesn't include ${what}. An admin can change that under Customers → Roles & Access.`
                : "Your role doesn't include this page. An admin can change that under Customers → Roles & Access."
            }
          />
          <div className="flex justify-center pb-6">
            <Button as={Link} href="/admin" variant="secondary">
              Back to dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return children;
}
