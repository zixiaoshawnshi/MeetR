interface ConsentDialogProps {
  onAgree: () => void
  onDecline: () => void
}

export default function ConsentDialog({ onAgree, onDecline }: ConsentDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0 mt-0.5">
            <span className="text-amber-400 text-base">⚠</span>
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-100 mb-1">
              Recording &amp; Transcription Notice
            </h2>
            <p className="text-sm text-gray-400 leading-relaxed">
              This session will be <span className="text-gray-200 font-medium">audio-recorded</span> and{' '}
              <span className="text-gray-200 font-medium">transcribed</span> for note-taking purposes.
              The recording is saved locally on this device only.
            </p>
            <p className="text-sm text-gray-500 mt-2 leading-relaxed">
              Please ensure all participants are aware and have given their consent before
              proceeding.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-gray-800">
          <button
            onClick={onDecline}
            className="px-4 py-2 rounded text-sm font-medium text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onAgree}
            className="px-4 py-2 rounded text-sm font-medium bg-blue-600 text-white hover:bg-blue-500 transition-colors"
          >
            All participants consent — Start Recording
          </button>
        </div>
      </div>
    </div>
  )
}
