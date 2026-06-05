export default function NotFound() {
  return (
    <main className="min-h-screen bg-[#0d0d1a] text-white flex items-center justify-center">
      <div className="text-center">
        <p className="text-6xl mb-4">🙏</p>
        <h1 className="text-2xl font-black text-yellow-400 mb-2">Page Not Found</h1>
        <a href="/" className="text-gray-400 hover:text-yellow-400 transition-colors">
          ← Back to Faucet
        </a>
      </div>
    </main>
  );
}
