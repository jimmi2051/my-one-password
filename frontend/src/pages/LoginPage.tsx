export function LoginPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-xl p-10 w-full max-w-md text-center">
        <div className="text-5xl mb-4">🔐</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">One Password</h1>
        <p className="text-gray-500 mb-8">Your local, encrypted password manager</p>
        <a
          href="http://localhost:8000/auth/google"
          className="block w-full bg-blue-600 text-white py-3 px-6 rounded-xl font-medium hover:bg-blue-700 transition"
        >
          Sign in with Google
        </a>
        <p className="text-xs text-gray-400 mt-6">
          Your passwords are stored locally and never leave your machine.
        </p>
      </div>
    </div>
  )
}
