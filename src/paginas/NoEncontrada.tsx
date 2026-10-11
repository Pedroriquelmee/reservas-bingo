import { Link } from 'react-router-dom';

export function NoEncontrada() {
  return (
    <div className="mx-auto max-w-md py-12 text-center">
      <p className="text-sm font-semibold uppercase tracking-wider text-slate-500">Error 404</p>
      <h1 className="mt-2 text-2xl font-extrabold">Esta página no existe</h1>
      <p className="mt-2 text-slate-600">Puede que el enlace esté mal escrito o que la página se haya movido.</p>
      <Link to="/" className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-fucsia-700 px-4 font-semibold text-white hover:bg-fucsia-800">
        Ir a las reservas
      </Link>
    </div>
  );
}
