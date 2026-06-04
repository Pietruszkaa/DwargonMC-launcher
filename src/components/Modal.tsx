import type { ReactNode } from 'react';

type ModalProps = {
  title: string;
  onClose: () => void;
  wide?: boolean;
  children: ReactNode;
};

export function Modal({ title, onClose, wide = false, children }: ModalProps): JSX.Element {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className={`modal ${wide ? 'modal-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <h2>{title}</h2>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Zamknij">
            ×
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
