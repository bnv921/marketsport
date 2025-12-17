'use client';

interface PreviewModalProps {
  previewData: any;
  onClose: () => void;
  onConfirm: () => void;
}

export default function PreviewModal({ previewData, onClose, onConfirm }: PreviewModalProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-zinc-900 rounded-lg p-6 max-w-md w-full mx-4">
        <h3 className="text-xl font-semibold mb-4">Order Preview</h3>
        
        <div className="space-y-2 mb-6">
          <div className="flex justify-between">
            <span className="text-zinc-600 dark:text-zinc-400">Side:</span>
            <span className="font-semibold">{previewData.side}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-600 dark:text-zinc-400">Type:</span>
            <span className="font-semibold">{previewData.order_type}</span>
          </div>
          {previewData.price && (
            <div className="flex justify-between">
              <span className="text-zinc-600 dark:text-zinc-400">Price:</span>
              <span className="font-semibold">{previewData.price}</span>
            </div>
          )}
          {previewData.size && (
            <div className="flex justify-between">
              <span className="text-zinc-600 dark:text-zinc-400">Size:</span>
              <span className="font-semibold">{previewData.size}</span>
            </div>
          )}
          {previewData.amount && (
            <div className="flex justify-between">
              <span className="text-zinc-600 dark:text-zinc-400">Amount:</span>
              <span className="font-semibold">{previewData.amount}</span>
            </div>
          )}
          {previewData.estimated_fee !== undefined && (
            <div className="flex justify-between">
              <span className="text-zinc-600 dark:text-zinc-400">Estimated Fee:</span>
              <span className="font-semibold">{previewData.estimated_fee.toFixed(4)}</span>
            </div>
          )}
          {previewData.total_cost !== undefined && (
            <div className="flex justify-between">
              <span className="text-zinc-600 dark:text-zinc-400">Total Cost:</span>
              <span className="font-semibold">{previewData.total_cost.toFixed(4)}</span>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 px-4 bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded hover:bg-zinc-300 dark:hover:bg-zinc-700"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2 px-4 bg-green-500 text-white rounded hover:bg-green-600"
          >
            Confirm Order
          </button>
        </div>
      </div>
    </div>
  );
}

