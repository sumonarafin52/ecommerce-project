export const dynamic = 'force-dynamic';

export default function LoginPage() {
  // TODO: email + password form
  // TODO: signIn() from next-auth/react দিয়ে submit করো
  // TODO: "Continue with Google" বাটন (optional)

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="mb-6 text-2xl font-bold">Login</h1>
      <form className="space-y-4">
        {/* TODO: email, password fields */}
        <button
          type="submit"
          className="w-full rounded bg-accent px-6 py-2 text-white"
        >
          Login
        </button>
      </form>
    </div>
  );
}
