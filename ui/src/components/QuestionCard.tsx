import { useState } from "react";
import type { QuestionData } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { Clock, HelpCircle } from "lucide-react";

interface QuestionCardProps {
  questionData: QuestionData;
  onReply: (body: string) => Promise<void>;
}

export function QuestionCard({ questionData, onReply }: QuestionCardProps) {
  const [submitting, setSubmitting] = useState<string | null>(null);

  async function handleOption(optionKey: string, optionLabel: string) {
    setSubmitting(optionKey);
    try {
      await onReply(optionLabel);
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div className="mt-3 rounded-md border border-sky-200 bg-sky-50 p-3 dark:border-sky-800 dark:bg-sky-950/40">
      <div className="flex items-start gap-2">
        <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-medium text-sky-900 dark:text-sky-100">{questionData.prompt}</p>

          {questionData.context && <p className="text-xs text-sky-700 dark:text-sky-300">{questionData.context}</p>}

          {questionData.options && questionData.options.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {questionData.options.map((option) => (
                <Button
                  key={option.key}
                  size="sm"
                  variant="outline"
                  className="border-sky-300 bg-white text-sky-800 hover:bg-sky-100 dark:border-sky-700 dark:bg-sky-900/50 dark:text-sky-200 dark:hover:bg-sky-800/60"
                  disabled={submitting !== null}
                  onClick={() => handleOption(option.key, option.label)}
                  title={option.description}
                >
                  {submitting === option.key ? "Sending..." : option.label}
                </Button>
              ))}
            </div>
          )}

          {questionData.timeoutHours !== undefined && (
            <p className="flex items-center gap-1 text-xs text-sky-600 dark:text-sky-400">
              <Clock className="h-3 w-3" />
              Auto-escalating in {questionData.timeoutHours}h if no response
              {questionData.fallbackOption ? ` (default: ${questionData.fallbackOption})` : ""}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
