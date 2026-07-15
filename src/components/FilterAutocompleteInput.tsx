import { useEffect, useId, useRef, useState } from "react";

interface FilterAutocompleteInputProps {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  suggestions: string[];
  onChange: (value: string) => void;
  disabled?: boolean;
  onCommit?: () => void;
  onCommitValue?: (value: string) => void;
  /** Max dropdown options after matching; 0 = no cap. */
  maxSuggestions?: number;
}

/** Case- and accent-insensitive form for matching (e.g. "Müller" ≈ "muller", "café" ≈ "cafe"). */
function normalizeForMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("ca");
}

function matchSuggestions(suggestions: string[], value: string): string[] {
  const query = normalizeForMatch(value.trim());
  if (!query) return suggestions;
  return suggestions.filter((suggestion) =>
    normalizeForMatch(suggestion).includes(query),
  );
}

export function FilterAutocompleteInput({
  id,
  label,
  placeholder,
  value,
  suggestions,
  onChange,
  disabled = false,
  onCommit,
  onCommitValue,
  maxSuggestions = 5,
}: FilterAutocompleteInputProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);

  const matchedSuggestions = matchSuggestions(suggestions, value);
  const limitedSuggestions =
    maxSuggestions > 0
      ? matchedSuggestions.slice(0, maxSuggestions)
      : matchedSuggestions;

  const showDropdown =
    open &&
    !disabled &&
    value.trim().length > 0 &&
    limitedSuggestions.length > 0;

  useEffect(() => {
    setHighlightIndex(-1);
  }, [value, limitedSuggestions.length]);

  useEffect(() => {
    if (!showDropdown) return;

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [showDropdown]);

  function selectSuggestion(suggestion: string) {
    onChange(suggestion);
    setOpen(false);
    setHighlightIndex(-1);
    if (onCommitValue) {
      onCommitValue(suggestion);
    } else {
      onCommit?.();
    }
    inputRef.current?.focus();
  }

  function handleBlur() {
    window.setTimeout(() => {
      if (!rootRef.current?.contains(document.activeElement)) {
        setOpen(false);
        const nextValue = inputRef.current?.value ?? value;
        if (onCommitValue) {
          onCommitValue(nextValue);
        } else {
          onCommit?.();
        }
      }
    }, 0);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      setHighlightIndex(-1);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setHighlightIndex(0);
        return;
      }
      setHighlightIndex((index) =>
        index < limitedSuggestions.length - 1 ? index + 1 : 0,
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setHighlightIndex(limitedSuggestions.length - 1);
        return;
      }
      setHighlightIndex((index) =>
        index > 0 ? index - 1 : limitedSuggestions.length - 1,
      );
      return;
    }

    if (event.key === "Enter") {
      if (showDropdown && highlightIndex >= 0) {
        event.preventDefault();
        selectSuggestion(limitedSuggestions[highlightIndex]!);
        return;
      }
      event.currentTarget.blur();
    }
  }

  return (
    <div className="field autocomplete-field" ref={rootRef}>
      <label htmlFor={id}>{label}</label>
      <div className="autocomplete-control">
        <input
          ref={inputRef}
          id={id}
          type="search"
          placeholder={placeholder}
          value={value}
          disabled={disabled}
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-haspopup="listbox"
          autoComplete="off"
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
        />
        {showDropdown && (
          <ul id={listId} className="autocomplete-dropdown" role="listbox">
            {limitedSuggestions.map((suggestion, index) => (
              <li
                key={suggestion}
                role="option"
                aria-selected={index === highlightIndex}
                className={[
                  "autocomplete-option",
                  index === highlightIndex && "is-active",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setHighlightIndex(index)}
                onClick={() => selectSuggestion(suggestion)}
              >
                {suggestion}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
