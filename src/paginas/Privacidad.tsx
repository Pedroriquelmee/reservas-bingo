import type { ReactNode } from 'react';

const RESPONSABLE = (import.meta.env.VITE_RESPONSABLE_TRATAMIENTO as string | undefined) || 'Grupo Scout Alba 601';
const CONTACTO = (import.meta.env.VITE_CONTACTO_PRIVACIDAD as string | undefined) || '';

export function Privacidad() {
  return (
    <article className="mx-auto max-w-2xl space-y-5 text-[15px] leading-relaxed text-slate-700">
      <h1 className="text-2xl font-extrabold text-slate-900">Privacidad</h1>

      <Bloque titulo="Quién trata tus datos">
        <p>
          {RESPONSABLE}
          {CONTACTO && (
            <>
              . Contacto:{' '}
              <a className="text-fucsia-700 underline" href={`mailto:${CONTACTO}`}>
                {CONTACTO}
              </a>
            </>
          )}
          .
        </p>
      </Bloque>

      <Bloque titulo="Para qué">
        <p>Únicamente para organizar qué personas ayudan cada domingo de bingo.</p>
      </Bloque>

      <Bloque titulo="Qué datos guardamos">
        <ul className="list-disc space-y-1 pl-5">
          <li>Tu nombre y apellidos.</li>
          <li>Tu correo electrónico, solo para que puedas identificarte. Nunca se muestra a otras personas.</li>
          <li>Tus reservas y cancelaciones, con su fecha.</li>
        </ul>
      </Bloque>

      <Bloque titulo="Qué ve el resto">
        <p>
          En la lista pública de próximos domingos solo aparece tu <strong>nombre y la inicial de tu apellido</strong> (por
          ejemplo, «María G.»). El nombre completo y el correo solo los ve la organización.
        </p>
      </Bloque>

      <Bloque titulo="Base legal y conservación">
        <p>
          Tratamos tus datos porque das tu consentimiento al registrarte. Puedes retirarlo cuando quieras eliminando tu cuenta.
          Los datos se conservan mientras mantengas la cuenta; el historial de domingos pasados se revisa y anonimiza
          periódicamente.
        </p>
      </Bloque>

      <Bloque titulo="Servicios que usamos">
        <p>
          La web se aloja en Vercel, los datos y el inicio de sesión los gestiona Supabase y los correos de acceso se envían con
          un proveedor de correo transaccional. Actúan como encargados del tratamiento y no usan tus datos para otros fines.
        </p>
      </Bloque>

      <Bloque titulo="Tus derechos">
        <p>
          Puedes consultar y corregir tus datos en «Mis reservas» y eliminarlos desde allí mismo. Para cualquier otra petición
          (acceso, oposición, limitación, portabilidad), escribe a la organización
          {CONTACTO ? ` (${CONTACTO})` : ''}. Si no quedas satisfecho/a, puedes reclamar ante la Agencia Española de
          Protección de Datos (aepd.es).
        </p>
      </Bloque>

      <Bloque titulo="Cookies">
        <p>
          No usamos cookies de publicidad ni de analítica. El navegador solo guarda la información técnica imprescindible para
          mantener tu sesión iniciada.
        </p>
      </Bloque>
    </article>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-1 text-lg font-bold text-slate-900">{titulo}</h2>
      {children}
    </section>
  );
}
