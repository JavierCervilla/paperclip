import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { useTheme } from "../context/ThemeContext";
import { cn } from "../lib/utils";

/** Map file extensions to CodeMirror language extensions. */
function getLanguageExtension(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "js":
    case "jsx":
      return javascript({ jsx: true });
    case "ts":
    case "tsx":
      return javascript({ jsx: true, typescript: true });
    case "json":
      return json();
    case "md":
    case "mdx":
      return markdown();
    default:
      return null;
  }
}

interface FileEditorProps {
  /** File name or path — used to detect language for syntax highlighting. */
  filename: string;
  /** Current editor content. */
  value: string;
  /** Called when the user edits the content. */
  onChange?: (value: string) => void;
  /** If true, the editor is read-only. */
  readOnly?: boolean;
  /** Optional CSS class name applied to the wrapper div. */
  className?: string;
}

export function FileEditor({
  filename,
  value,
  onChange,
  readOnly = false,
  className,
}: FileEditorProps) {
  const { theme } = useTheme();

  const extensions = useMemo(() => {
    const lang = getLanguageExtension(filename);
    return lang ? [lang] : [];
  }, [filename]);

  return (
    <div className={cn("overflow-hidden rounded-md border", className)}>
      <CodeMirror
        value={value}
        onChange={onChange}
        readOnly={readOnly}
        theme={theme === "dark" ? "dark" : "light"}
        extensions={extensions}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: !readOnly,
        }}
      />
    </div>
  );
}
