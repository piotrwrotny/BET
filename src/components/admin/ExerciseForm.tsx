import { useState } from "react";

type ExerciseType = "multiple_choice" | "fill_in_blank" | "true_false";

interface ExerciseFormProps {
  lessonId: string;
  exerciseId?: string;
  initialType?: ExerciseType;
  initialPrompt?: string;
  initialOptions?: string[];
  initialKeys?: string[];
  redirectTo: string;
}

const EMPTY_OPTIONS = ["", "", "", ""];

export function ExerciseForm({
  lessonId,
  exerciseId,
  initialType = "multiple_choice",
  initialPrompt = "",
  initialOptions,
  initialKeys,
  redirectTo,
}: ExerciseFormProps) {
  const [type, setType] = useState<ExerciseType>(initialType);
  const [prompt, setPrompt] = useState(initialPrompt);
  // MC
  const [options, setOptions] = useState<string[]>(initialOptions ?? EMPTY_OPTIONS);
  const [correctOption, setCorrectOption] = useState(
    initialType === "multiple_choice" && initialKeys?.[0] ? initialKeys[0] : ""
  );
  // FIB
  const [fibKeys, setFibKeys] = useState<string[]>(
    initialType === "fill_in_blank" && initialKeys?.length ? initialKeys : [""]
  );
  // T/F
  const [tfKey, setTfKey] = useState<"true" | "false">(
    initialType === "true_false" && initialKeys?.[0] === "false" ? "false" : "true"
  );

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const validate = (): string | null => {
    if (!prompt.trim()) return "Treść ćwiczenia jest wymagana";
    if (type === "multiple_choice") {
      const filled = options.filter((o) => o.trim());
      if (filled.length < 2) return "Podaj co najmniej 2 opcje";
      if (!correctOption) return "Wybierz poprawną odpowiedź";
      if (!filled.includes(correctOption)) return "Poprawna odpowiedź musi być jedną z opcji";
    }
    if (type === "fill_in_blank") {
      if (!fibKeys.some((k) => k.trim())) return "Podaj co najmniej jeden klucz odpowiedzi";
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);

    const payload =
      type === "multiple_choice" ? { options: options.filter((o) => o.trim()) } : {};

    const keys =
      type === "multiple_choice"
        ? [correctOption]
        : type === "fill_in_blank"
          ? fibKeys.filter((k) => k.trim())
          : [tfKey];

    const url = exerciseId
      ? `/api/admin/exercises/${exerciseId}`
      : "/api/admin/exercises";

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lesson_id: lessonId, type, prompt, payload, keys }),
      });

      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        setError(json.error ?? "Nieznany błąd");
        setSubmitting(false);
        return;
      }

      location.href = redirectTo;
    } catch {
      setError("Błąd połączenia z serwerem");
      setSubmitting(false);
    }
  };

  const setOption = (idx: number, val: string) =>
    setOptions((prev) => prev.map((o, i) => (i === idx ? val : o)));

  const removeOption = (idx: number) => {
    const next = options.filter((_, i) => i !== idx);
    setOptions(next);
    if (correctOption === options[idx]) setCorrectOption("");
  };

  const setFibKey = (idx: number, val: string) =>
    setFibKeys((prev) => prev.map((k, i) => (i === idx ? val : k)));

  const removeFibKey = (idx: number) => setFibKeys((prev) => prev.filter((_, i) => i !== idx));

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-5">
      {error && (
        <div className="rounded-md border border-destructive bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Type */}
      <div className="space-y-1">
        <label className="text-sm font-medium">Typ ćwiczenia *</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as ExerciseType)}
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <option value="multiple_choice">Wybór wielokrotny (Multiple Choice)</option>
          <option value="fill_in_blank">Uzupełnij lukę (Fill in the Blank)</option>
          <option value="true_false">Prawda / Fałsz (True/False)</option>
        </select>
      </div>

      {/* Prompt */}
      <div className="space-y-1">
        <label className="text-sm font-medium">
          Treść ćwiczenia *
          {type === "fill_in_blank" && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              Użyj _____ jako oznaczenia luki
            </span>
          )}
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          required
          className="w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          placeholder={
            type === "fill_in_blank"
              ? "She _____ to school yesterday."
              : "Treść pytania lub polecenia…"
          }
        />
      </div>

      {/* MC options */}
      {type === "multiple_choice" && (
        <div className="space-y-2">
          <label className="text-sm font-medium">Opcje odpowiedzi * (zaznacz poprawną)</label>
          <div className="space-y-2">
            {options.map((opt, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="correct_option"
                  checked={correctOption === opt && opt.trim() !== ""}
                  onChange={() => opt.trim() && setCorrectOption(opt)}
                  className="mt-0.5 shrink-0"
                  title="Zaznacz jako poprawną"
                />
                <input
                  type="text"
                  value={opt}
                  onChange={(e) => {
                    const oldVal = opt;
                    setOption(idx, e.target.value);
                    if (correctOption === oldVal) setCorrectOption(e.target.value);
                  }}
                  placeholder={`Opcja ${idx + 1}`}
                  className="h-8 flex-1 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                />
                {options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeOption(idx)}
                    className="text-xs text-destructive hover:underline"
                  >
                    Usuń
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setOptions((prev) => [...prev, ""])}
            className="text-xs text-blue-600 hover:underline"
          >
            + Dodaj opcję
          </button>
        </div>
      )}

      {/* FIB keys */}
      {type === "fill_in_blank" && (
        <div className="space-y-2">
          <label className="text-sm font-medium">
            Dopuszczalne odpowiedzi *
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              (wpisz wszystkie akceptowalne warianty)
            </span>
          </label>
          <div className="space-y-2">
            {fibKeys.map((key, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="text"
                  value={key}
                  onChange={(e) => setFibKey(idx, e.target.value)}
                  placeholder={`Odpowiedź ${idx + 1}`}
                  className="h-8 flex-1 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                />
                {fibKeys.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeFibKey(idx)}
                    className="text-xs text-destructive hover:underline"
                  >
                    Usuń
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setFibKeys((prev) => [...prev, ""])}
            className="text-xs text-blue-600 hover:underline"
          >
            + Dodaj wariant odpowiedzi
          </button>
        </div>
      )}

      {/* T/F key */}
      {type === "true_false" && (
        <div className="space-y-2">
          <label className="text-sm font-medium">Poprawna odpowiedź *</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="tf_key"
                value="true"
                checked={tfKey === "true"}
                onChange={() => setTfKey("true")}
              />
              Prawda
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="tf_key"
                value="false"
                checked={tfKey === "false"}
                onChange={() => setTfKey("false")}
              />
              Fałsz
            </label>
          </div>
        </div>
      )}

      {/* Submit */}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {submitting ? "Zapisywanie…" : exerciseId ? "Zapisz zmiany" : "Utwórz ćwiczenie"}
        </button>
        <a
          href={redirectTo}
          className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm text-muted-foreground transition-colors hover:bg-muted"
        >
          Anuluj
        </a>
      </div>
    </form>
  );
}
