import type { AdapterConfigFieldsProps } from "../types";
import { Field, ToggleField, DraftInput, DraftNumberInput, help } from "../../components/agent-config-primitives";
import { ChoosePathButton } from "../../components/PathInstructionsModal";
import { LocalWorkspaceRuntimeFields } from "../local-workspace-runtime-fields";
import { useState } from "react";

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";

const instructionsFileHint =
  "Absolute path to a markdown file (e.g. AGENTS.md) that defines this agent's behavior. Injected into the system prompt at runtime.";

export function ClaudeLocalConfigFields({
  mode,
  isCreate,
  adapterType,
  values,
  set,
  config,
  eff,
  mark,
  models,
  hideInstructionsFile,
}: AdapterConfigFieldsProps) {
  return (
    <>
      {!hideInstructionsFile && (
        <Field label="Agent instructions file" hint={instructionsFileHint}>
          <div className="flex items-center gap-2">
            <DraftInput
              value={
                isCreate
                  ? (values!.instructionsFilePath ?? "")
                  : eff("adapterConfig", "instructionsFilePath", String(config.instructionsFilePath ?? ""))
              }
              onCommit={(v) =>
                isCreate
                  ? set!({ instructionsFilePath: v })
                  : mark("adapterConfig", "instructionsFilePath", v || undefined)
              }
              immediate
              className={inputClass}
              placeholder="/absolute/path/to/AGENTS.md"
            />
            <ChoosePathButton />
          </div>
        </Field>
      )}
      <LocalWorkspaceRuntimeFields
        isCreate={isCreate}
        values={values}
        set={set}
        config={config}
        mark={mark}
        eff={eff}
        mode={mode}
        adapterType={adapterType}
        models={models}
      />
    </>
  );
}

const TOOL_SUGGESTIONS = ["Bash(curl:*)", "Bash(git:*)", "Read", "Write", "Edit", "Grep", "Glob", "Agent", "WebFetch"];

function TagListInput({
  value,
  onChange,
  placeholder,
  suggestions = TOOL_SUGGESTIONS,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
}) {
  const [input, setInput] = useState("");
  const add = (tag: string) => {
    const t = tag.trim();
    if (t && !value.includes(t)) onChange([...value, t]);
    setInput("");
  };
  const remove = (tag: string) => onChange(value.filter((t) => t !== tag));
  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-mono"
            >
              {tag}
              <button
                type="button"
                onClick={() => remove(tag)}
                className="text-muted-foreground hover:text-foreground ml-0.5 leading-none"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        type="text"
        className={inputClass}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(input);
          }
        }}
        placeholder={placeholder ?? "Type a tool pattern and press Enter to add"}
      />
      {suggestions.length > 0 && (
        <p className="text-xs text-muted-foreground">Examples: {suggestions.slice(0, 5).join(", ")}</p>
      )}
    </div>
  );
}

export function ClaudeLocalAdvancedFields({ isCreate, values, set, config, eff, mark }: AdapterConfigFieldsProps) {
  return (
    <>
      <ToggleField
        label="Enable Chrome"
        hint={help.chrome}
        checked={isCreate ? values!.chrome : eff("adapterConfig", "chrome", config.chrome === true)}
        onChange={(v) => (isCreate ? set!({ chrome: v }) : mark("adapterConfig", "chrome", v))}
      />
      <Field
        label="Permission mode"
        hint="Controls how Claude handles permission checks. 'auto' uses AI-based safe-operation classification (recommended). 'default' shows interactive prompts. 'bypassPermissions' skips all checks. 'plan' restricts to read-only planning. When set, this takes precedence over Skip permissions."
      >
        <select
          className={inputClass}
          value={
            isCreate
              ? (values!.permissionMode ?? "auto")
              : eff("adapterConfig", "permissionMode", String(config.permissionMode ?? "auto"))
          }
          onChange={(e) =>
            isCreate
              ? set!({ permissionMode: e.target.value })
              : mark("adapterConfig", "permissionMode", e.target.value)
          }
        >
          <option value="auto">auto — AI-based safe-operation classifier (recommended)</option>
          <option value="default">default — interactive permission prompts</option>
          <option value="bypassPermissions">bypassPermissions — skip all checks</option>
          <option value="plan">plan — read-only planning mode</option>
        </select>
      </Field>
      <ToggleField
        label="Skip permissions (legacy)"
        hint="Run Claude without permission prompts. Legacy flag — use Permission mode instead for new agents. Ignored when Permission mode is explicitly set."
        checked={
          isCreate
            ? values!.dangerouslySkipPermissions
            : eff("adapterConfig", "dangerouslySkipPermissions", config.dangerouslySkipPermissions !== false)
        }
        onChange={(v) =>
          isCreate ? set!({ dangerouslySkipPermissions: v }) : mark("adapterConfig", "dangerouslySkipPermissions", v)
        }
      />
      <Field label="Max turns per run" hint={help.maxTurnsPerRun}>
        {isCreate ? (
          <input
            type="number"
            className={inputClass}
            value={values!.maxTurnsPerRun}
            onChange={(e) => set!({ maxTurnsPerRun: Number(e.target.value) })}
          />
        ) : (
          <DraftNumberInput
            value={eff("adapterConfig", "maxTurnsPerRun", Number(config.maxTurnsPerRun ?? 300))}
            onCommit={(v) => mark("adapterConfig", "maxTurnsPerRun", v || 300)}
            immediate
            className={inputClass}
          />
        )}
      </Field>
      <Field
        label="Allowed tools"
        hint="Restrict Claude to these tool patterns (e.g. Bash(curl:*), Read, Write). Leave empty to allow all tools."
      >
        <TagListInput
          value={isCreate ? (values!.allowedTools ?? []) : ((config.allowedTools as string[] | undefined) ?? [])}
          onChange={(v) =>
            isCreate ? set!({ allowedTools: v }) : mark("adapterConfig", "allowedTools", v.length ? v : undefined)
          }
        />
      </Field>
      <Field
        label="Disallowed tools"
        hint="Block Claude from using these tool patterns. Applied when Skip permissions is off."
      >
        <TagListInput
          value={isCreate ? (values!.disallowedTools ?? []) : ((config.disallowedTools as string[] | undefined) ?? [])}
          onChange={(v) =>
            isCreate ? set!({ disallowedTools: v }) : mark("adapterConfig", "disallowedTools", v.length ? v : undefined)
          }
        />
      </Field>
    </>
  );
}
