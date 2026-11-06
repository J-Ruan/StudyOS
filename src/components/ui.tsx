import {
  useEffect,
  useRef,
  useState,
  useId,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
  type FormEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { ZodError } from 'zod';
import { X, Plus, ArrowUpRight, LoaderCircle } from 'lucide-react';
export function Button({
  children,
  variant = 'primary',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
}) {
  return (
    <button {...props} className={`button ${variant} ${props.className ?? ''}`}>
      {children}
    </button>
  );
}
export function IconButton({
  label,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      {...props}
      className={`icon-button ${props.className ?? ''}`}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}
export function Empty({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="empty">
      <span className="empty-mark">—</span>
      <p>{title}</p>
      {action && (
        <Button variant="secondary" onClick={onAction}>
          <Plus size={16} />
          {action}
        </Button>
      )}
    </div>
  );
}
export function SectionTitle({
  children,
  action,
  onAction,
}: {
  children: ReactNode;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="section-title">
      <h2>{children}</h2>
      {action && (
        <button className="text-button" onClick={onAction}>
          {action}
          <ArrowUpRight size={16} />
        </button>
      )}
    </div>
  );
}
export function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const fieldId = useId();
  return (
    <div className={`field ${wide ? 'wide' : ''}`}>
      <label htmlFor={fieldId}>{label}</label>
      {isValidElement(children)
        ? cloneElement(children as ReactElement<{ id?: string }>, { id: fieldId })
        : children}
    </div>
  );
}
let modalCount = 0;
let savedOverflow = '';
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    if (modalCount++ === 0) {
      savedOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    const node = ref.current!;
    const selectors =
      'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]';
    (
      (node.querySelector('input,select,textarea') as HTMLElement) ??
      node.querySelector<HTMLElement>(selectors)
    )?.focus();
    function key(e: KeyboardEvent) {
      const dialogs = document.querySelectorAll('[role=dialog]');
      if (dialogs[dialogs.length - 1] !== node) return;
      if (e.key === 'Escape') closeRef.current();
      if (e.key === 'Tab') {
        const items = [...node.querySelectorAll<HTMLElement>(selectors)].filter(
          (n) => n.getClientRects().length,
        );
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener('keydown', key);
    return () => {
      if (--modalCount === 0) document.body.style.overflow = savedOverflow;
      document.removeEventListener('keydown', key);
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal ${wide ? 'modal-wide' : ''}`}
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-header">
          <h2>{title}</h2>
          <IconButton label="关闭" onClick={onClose}>
            <X size={20} />
          </IconButton>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
export function SaveForm({
  children,
  onSave,
  footer,
}: {
  children: ReactNode;
  onSave: () => Promise<void>;
  footer?: ReactNode;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await onSave();
    } catch (e) {
      setError(
        e instanceof ZodError
          ? e.issues[0].message
          : e instanceof Error
            ? e.message
            : '保存失败，请重试',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <fieldset disabled={busy}>{children}</fieldset>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      <div className="form-footer">
        {footer}
        <Button type="submit" disabled={busy}>
          {busy ? <LoaderCircle size={16} className="spin" /> : null}保存
        </Button>
      </div>
    </form>
  );
}
export function Tabs({
  items,
  value,
  onChange,
}: {
  items: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {items.map((item) => (
        <button
          role="tab"
          aria-selected={value === item.value}
          key={item.value}
          onClick={() => onChange(item.value)}
          className={value === item.value ? 'selected' : ''}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
