import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface SummaryPanelProps {
  content: string | null
  lastUpdated?: string
}

export default function SummaryPanel({ content, lastUpdated }: SummaryPanelProps) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div
      className={`shrink-0 border-t border-gray-700 bg-gray-900 transition-all duration-200 ${
        collapsed ? 'h-9' : 'h-48'
      }`}
    >
      {/* Panel header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            AI Summary
          </span>
          {lastUpdated && !collapsed && (
            <span className="text-xs text-gray-600">
              Last updated {new Date(lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          aria-label={collapsed ? 'Expand summary' : 'Collapse summary'}
        >
          {collapsed ? '▲ Expand' : '▼ Collapse'}
        </button>
      </div>

      {/* Summary body */}
      {!collapsed && (
        <div className="overflow-y-auto h-[calc(100%-36px)] p-3">
          {content ? (
            <div className="prose-dark text-sm">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {content}
              </ReactMarkdown>
            </div>
          ) : (
            <div className="flex items-center gap-3 h-full">
              <div className="text-center w-full">
                <p className="text-sm text-gray-600">No summary yet.</p>
                <p className="text-xs text-gray-700 mt-1">
                  Press <span className="text-gray-500">✦ AI Update</span> after some discussion to generate one.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
