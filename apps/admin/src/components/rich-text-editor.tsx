'use client';

import { useState, useEffect, useRef } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';

/**
 * WYSIWYG editor for email templates.
 *
 * The editor surfaces the same operations a non-technical operator would
 * expect from Magento's TinyMCE (bold / italic / headings / lists /
 * links / images / undo / redo) plus an "Insertar variable" dropdown
 * that drops a Handlebars expression at the cursor — so the client never
 * has to type `{{...}}` syntax themselves.
 *
 * A "Ver HTML" toggle flips to a `<textarea>` for power users who need
 * to drop into raw HTML (e.g. inline-styling for legacy email clients).
 *
 * The component is fully controlled: parent owns the HTML string and
 * passes it as `value`; edits raise `onChange(html)`. We bypass TipTap's
 * usual `editor.getHTML()` polling by listening to the `update` event,
 * which fires synchronously on every change.
 */
export interface VariableOption {
  /** Variable name surface — what shows in the dropdown. */
  label: string;
  /** Handlebars expression including curly braces, e.g. `{{customer.firstName}}`. */
  expression: string;
  /** Optional small hint text shown below the label in the dropdown. */
  description?: string;
}

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  variables?: VariableOption[];
  placeholder?: string;
  minHeight?: number;
}

const DEFAULT_VARIABLES: VariableOption[] = [
  {
    label: 'Nombre del cliente',
    expression: '{{customer.firstName}}',
    description: 'Primer nombre del destinatario',
  },
  {
    label: 'Email del cliente',
    expression: '{{customer.email}}',
  },
  {
    label: 'Cantidad de productos',
    expression: '{{itemsCount}}',
    description: 'Número de items distintos en el carrito',
  },
  {
    label: 'Cantidad total',
    expression: '{{itemsQty}}',
    description: 'Suma de unidades de todos los items',
  },
  {
    label: 'Subtotal',
    expression: '{{subtotal}}',
  },
  {
    label: 'Total',
    expression: '{{grandTotal}}',
  },
  {
    label: 'Moneda',
    expression: '{{currencyCode}}',
    description: 'Ej. ARS, USD',
  },
  {
    label: 'URL de recuperación',
    expression: '{{recoveryUrl}}',
    description: 'Link para restaurar el carrito (ya incluye token + cupón)',
  },
  {
    label: 'Código de cupón',
    expression: '{{coupon.code}}',
    description: 'Solo si el stage tiene modo de cupón distinto a "ninguno"',
  },
  {
    label: 'Nombre de campaña',
    expression: '{{campaign.name}}',
  },
];

export function RichTextEditor({
  value,
  onChange,
  variables = DEFAULT_VARIABLES,
  placeholder = 'Escribí el cuerpo del email…',
  minHeight = 360,
}: RichTextEditorProps): React.ReactElement {
  const [showSource, setShowSource] = useState(false);
  const [showVariables, setShowVariables] = useState(false);
  const [showImageMenu, setShowImageMenu] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isInternalUpdate = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        // Sane defaults; allow code blocks for technical users.
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
      Image.configure({
        inline: false,
        allowBase64: false,
        HTMLAttributes: { style: 'max-width: 100%; height: auto;' },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        // Tailwind classes inside the editor surface. The `prose` plugin
        // is not in the project, so we hand-roll basic typography.
        class:
          'min-h-[200px] px-4 py-3 text-sm text-foreground focus:outline-none [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:my-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:my-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:my-2 [&_p]:my-2 [&_ul]:list-disc [&_ul]:ml-6 [&_ol]:list-decimal [&_ol]:ml-6 [&_a]:text-primary [&_a]:underline [&_strong]:font-semibold [&_em]:italic [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:italic [&_code]:font-mono [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_img]:rounded-md',
      },
    },
    onUpdate: ({ editor: ed }) => {
      isInternalUpdate.current = true;
      onChange(ed.getHTML());
      // Reset on next tick so external `value` changes still sync back.
      queueMicrotask(() => {
        isInternalUpdate.current = false;
      });
    },
  });

  // Keep editor in sync when `value` changes externally (e.g. after a
  // server-side save round-trip). Skip when the update originated here.
  useEffect(() => {
    if (!editor) return;
    if (isInternalUpdate.current) return;
    if (editor.getHTML() === value) return;
    editor.commands.setContent(value, { emitUpdate: false });
  }, [value, editor]);

  function insertVariable(expr: string): void {
    if (!editor) return;
    editor.chain().focus().insertContent(expr).run();
    setShowVariables(false);
  }

  function setLink(): void {
    if (!editor) return;
    const previous = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('URL del link', previous ?? 'https://');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }

  async function uploadImageFile(file: File): Promise<string> {
    if (file.size > 5 * 1024 * 1024) {
      throw new Error('La imagen supera el límite de 5 MB.');
    }
    if (!file.type.startsWith('image/')) {
      throw new Error('El archivo no es una imagen.');
    }
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/admin/media', { method: 'POST', body: form });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Error al subir la imagen (${res.status.toString()}): ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as { url: string };
    return json.url;
  }

  if (!editor) {
    return <div className="h-[200px] rounded-md border border-input bg-background" />;
  }

  return (
    <div className="overflow-hidden rounded-md border border-input bg-background">
      <div className="flex flex-wrap items-center gap-1 border-b border-border bg-muted/30 px-2 py-1.5">
        <ToolbarButton
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Negrita (⌘B)"
        >
          <strong>B</strong>
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Cursiva (⌘I)"
        >
          <em>I</em>
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('strike')}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          title="Tachado"
        >
          <span className="line-through">S</span>
        </ToolbarButton>
        <Divider />
        <ToolbarButton
          active={editor.isActive('heading', { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          title="Título 1"
        >
          H1
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          title="Título 2"
        >
          H2
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('heading', { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          title="Título 3"
        >
          H3
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('paragraph')}
          onClick={() => editor.chain().focus().setParagraph().run()}
          title="Párrafo"
        >
          P
        </ToolbarButton>
        <Divider />
        <ToolbarButton
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="Lista con viñetas"
        >
          •
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="Lista numerada"
        >
          1.
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          title="Cita"
        >
          ❝
        </ToolbarButton>
        <Divider />
        <ToolbarButton
          active={editor.isActive('link')}
          onClick={setLink}
          title="Insertar / editar link"
        >
          🔗
        </ToolbarButton>
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowImageMenu((v) => !v);
              setUploadError(null);
            }}
            disabled={uploading}
            className="flex h-7 min-w-[28px] items-center justify-center rounded-md px-1.5 text-xs text-foreground transition hover:bg-muted disabled:opacity-40"
            title="Insertar imagen"
          >
            {uploading ? '…' : '🖼'}
          </button>
          {showImageMenu && (
            <>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => setShowImageMenu(false)}
                className="fixed inset-0 z-30 cursor-default"
              />
              <div className="absolute left-0 top-full z-40 mt-1 w-64 rounded-md border border-border bg-popover p-1.5 shadow-lg">
                <button
                  type="button"
                  onClick={() => {
                    setShowImageMenu(false);
                    fileInputRef.current?.click();
                  }}
                  className="block w-full rounded-md px-3 py-2 text-left text-xs hover:bg-muted"
                >
                  <div className="font-medium text-foreground">Subir desde mi computadora</div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    PNG / JPG / WEBP / GIF, máx 5 MB
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowImageMenu(false);
                    const url = window.prompt('URL pública de la imagen (https://…)');
                    if (url && editor) {
                      editor.chain().focus().setImage({ src: url }).run();
                    }
                  }}
                  className="block w-full rounded-md px-3 py-2 text-left text-xs hover:bg-muted"
                >
                  <div className="font-medium text-foreground">Pegar URL existente</div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    Útil si ya hosteas la imagen en otro lado
                  </div>
                </button>
              </div>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = ''; // reset so same filename can be re-picked
              if (!file || !editor) return;
              setUploading(true);
              setUploadError(null);
              try {
                const url = await uploadImageFile(file);
                editor.chain().focus().setImage({ src: url }).run();
              } catch (err) {
                setUploadError((err as Error).message);
              } finally {
                setUploading(false);
              }
            }}
          />
        </div>
        <Divider />
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowVariables((v) => !v)}
            className="rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-foreground transition hover:bg-muted"
          >
            Insertar variable ▾
          </button>
          {showVariables && (
            <>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => setShowVariables(false)}
                className="fixed inset-0 z-30 cursor-default"
              />
              <div className="absolute left-0 top-full z-40 mt-1 max-h-72 w-72 overflow-auto rounded-md border border-border bg-popover shadow-lg">
                {variables.map((v) => (
                  <button
                    key={v.expression}
                    type="button"
                    onClick={() => insertVariable(v.expression)}
                    className="block w-full px-3 py-2 text-left text-xs hover:bg-muted"
                  >
                    <div className="font-medium text-foreground">{v.label}</div>
                    <code className="text-[10px] text-muted-foreground">{v.expression}</code>
                    {v.description && (
                      <div className="mt-0.5 text-[10px] text-muted-foreground">
                        {v.description}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <Divider />
        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="Deshacer (⌘Z)"
        >
          ↶
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="Rehacer (⇧⌘Z)"
        >
          ↷
        </ToolbarButton>
        <div className="ml-auto">
          <button
            type="button"
            onClick={() => setShowSource((s) => !s)}
            className={`rounded-md px-2 py-1 text-xs font-medium transition ${
              showSource
                ? 'bg-primary text-primary-foreground'
                : 'border border-border bg-background text-foreground hover:bg-muted'
            }`}
            title="Alternar entre vista visual y código HTML"
          >
            {showSource ? '◐ Visual' : '</> HTML'}
          </button>
        </div>
      </div>

      {uploadError && (
        <div className="border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {uploadError}{' '}
          <button
            type="button"
            onClick={() => setUploadError(null)}
            className="underline"
          >
            Cerrar
          </button>
        </div>
      )}

      {showSource ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={Math.max(12, Math.floor(minHeight / 22))}
          className="block w-full bg-background p-3 font-mono text-xs text-foreground focus:outline-none"
          style={{ minHeight }}
        />
      ) : (
        <EditorContent editor={editor} style={{ minHeight }} />
      )}
    </div>
  );
}

function ToolbarButton({
  children,
  onClick,
  active,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex h-7 min-w-[28px] items-center justify-center rounded-md px-1.5 text-xs transition ${
        active
          ? 'bg-primary text-primary-foreground'
          : 'text-foreground hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent'
      }`}
    >
      {children}
    </button>
  );
}

function Divider(): React.ReactElement {
  return <span className="mx-0.5 h-5 w-px bg-border" aria-hidden="true" />;
}
