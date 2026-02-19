import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface AgendaPanelProps {
  content: string
}

const PLACEHOLDER = `- [ ] Introduction
- [ ] Topic 1
  - [ ] Sub-topic
- [ ] Topic 2
- [ ] Next steps`

export default function AgendaPanel({ content }: AgendaPanelProps) {
  const [editMode, setEditMode] = useState(false)
  const [draft, setDraft] = useState(content)

  const displayContent = content || draft

  return (
    <div className="flex flex-col w-80 shrink-0 bg-gray-900 overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700 shrink-0">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Agenda</span>
        <button
          onClick={() => setEditMode((v) => !v)}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          {editMode ? 'View' : 'Edit'}
        </button>
      </div>

      {/* Panel body */}
      <div className="flex-1 overflow-y-auto p-3">
        {editMode ? (
          <textarea
            className="w-full h-full min-h-40 bg-transparent text-gray-300 text-sm font-mono resize-none outline-none placeholder-gray-600"
            value={draft || content}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={PLACEHOLDER}
            spellCheck={false}
          />
        ) : displayContent ? (
          <div className="prose-dark text-sm">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                li: ({ children, ...props }) => (
                  <li className="flex items-start gap-1.5 my-0.5 text-gray-300" {...props}>
                    {children}
                  </li>
                ),
                ul: ({ children }) => (
                  <ul className="list-none pl-4 space-y-0.5">{children}</ul>
                ),
                input: ({ ...props }) => (
                  <input {...props} className="mt-0.5 accent-blue-500" readOnly />
                )
              }}
            >
              {displayContent}
            </ReactMarkdown>
          </div>
        ) : (
          <div className="flex flex-col gap-3 items-start">
            <p className="text-gray-600 text-sm">No agenda yet.</p>
            <button
              onClick={() => setEditMode(true)}
              className="text-xs text-blue-500 hover:text-blue-400 transition-colors"
            >
              + Add agenda items
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
