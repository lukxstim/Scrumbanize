import Button from './ui/Button';
import Dialog from './ui/Dialog';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({ open, title, message, confirmLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onCancel} labelledBy="confirm-dialog-title" mobile="compact" closeOnBackdrop className="max-w-sm p-6">
      <h2 id="confirm-dialog-title" className="text-base font-semibold text-fg">
        {title}
      </h2>
      <p className="mt-2 text-sm text-fg-muted">{message}</p>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Abbrechen
        </Button>
        <Button variant="danger" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
