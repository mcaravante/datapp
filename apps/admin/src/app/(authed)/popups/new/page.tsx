import Link from 'next/link';
import { PopupEditor } from '../popup-editor';

export const metadata = { title: 'Datapp · Nuevo popup' };

export default function NewPopupPage(): React.ReactElement {
  return (
    <div className="mx-auto max-w-6xl space-y-5 p-8">
      <div>
        <Link href="/popups" className="text-sm text-muted-foreground hover:text-primary">
          ← Volver a popups
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          Nuevo popup
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          El popup se crea en estado <code className="rounded bg-muted/60 px-1 text-[11px]">borrador</code>.
          Activalo cuando lo quieras mostrar en la storefront.
        </p>
      </div>
      <PopupEditor popup={null} />
    </div>
  );
}
