export default function Loader({ text = "Loading…" }) {
  return (
    <div className="flex min-h-screen items-center justify-center text-gray-600">
      {text}
    </div>
  );
}
