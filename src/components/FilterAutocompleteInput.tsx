interface FilterAutocompleteInputProps {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  suggestions: string[];
  onChange: (value: string) => void;
}

export function FilterAutocompleteInput({
  id,
  label,
  placeholder,
  value,
  suggestions,
  onChange,
}: FilterAutocompleteInputProps) {
  const listId = `${id}-suggestions`;

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        list={listId}
        autoComplete="off"
      />
      <datalist id={listId}>
        {suggestions.map((suggestion) => (
          <option key={suggestion} value={suggestion} />
        ))}
      </datalist>
    </div>
  );
}
