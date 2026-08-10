
export const dynamic = 'force-dynamic';
export default function RegisterPage() {
  // TODO: name, email, password form
  // TODO: submit করলে /api/users (POST) call করবে যেটা bcrypt দিয়ে password hash করে save করবে

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="mb-6 text-2xl font-bold">Create Account</h1>
      <form className="space-y-4">
        {/* TODO: name, email, password fields */}
        <button
          type="submit"
          className="w-full rounded bg-accent px-6 py-2 text-white"
        >
          Register
        </button>
      </form>
    </div>
  );
}
