'use client';

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { X } from 'lucide-react';

export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export function Button({
  variant = 'ghost',
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger' | 'subtle';
}) {
  return (
    <button
      className={cn(
        'btn',
        variant === 'primary' && 'btn-primary',
        variant === 'danger' && 'btn-danger',
        variant === 'subtle' && 'btn-subtle',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Panel({
  className,
  children
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn('panel', className)}>{children}</div>;
}

export function Field({
  label,
  hint,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string }) {
  return (
    <label className="block">
      {label && <span className="field-label">{label}</span>}
      <input className={cn('field', className)} {...props} />
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  description?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div>
        <p className="font-medium">{label}</p>
        {description && <p className="muted mt-1 text-xs leading-5">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={cn('toggle', checked && 'toggle-on')}
        onClick={onChange}
      >
        <span className="toggle-knob" />
      </button>
    </div>
  );
}

export function Badge({
  children,
  tone = 'neutral'
}: {
  children: ReactNode;
  tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'accent';
}) {
  return <span className={cn('badge', `badge-${tone}`)}>{children}</span>;
}

export function Modal({
  open,
  title,
  children,
  onClose,
  wide
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className={cn('panel modal-card', wide && 'max-w-2xl')}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description
}: {
  icon: ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <div className="grid place-items-center px-5 py-12 text-center">
      <div className="empty-icon">{icon}</div>
      <p className="mt-4 font-medium">{title}</p>
      {description && <p className="muted mt-1 max-w-sm text-sm">{description}</p>}
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-[#b8afc6]">
      <span className="spinner" />
      {label}
    </div>
  );
}

export function SectionTitle({
  eyebrow,
  title,
  description,
  action
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h2>
        {description && <p className="muted mt-1 text-sm">{description}</p>}
      </div>
      {action}
    </div>
  );
}
