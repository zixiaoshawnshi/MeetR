interface NotesPanelProps {
  content: string
  onChange: (content: string) => void
}

export default function NotesPanel({ content, onChange }: NotesPanelProps) {
  return (
    <div className="flex flex-col w-72 shrink-0 bg-gray-900 overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center px-3 py-2 border-b border-gray-700 shrink-0">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Manual Notes
        </span>
      </div>

      {/* Notes body */}
      <div className="flex-1 overflow-hidden p-3">
        <textarea
          className="w-full h-full bg-transparent text-sm text-gray-300 resize-none outline-none placeholder-gray-600 leading-relaxed"
          value={content}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type notes here during the meeting…&#10;&#10;These will be included when the AI generates a summary."
          spellCheck
        />
      </div>
    </div>
  )
}
