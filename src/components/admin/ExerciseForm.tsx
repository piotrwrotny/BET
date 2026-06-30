import { useState } from "react";

type ExerciseType =
  | "multiple_choice"
  | "fill_in_blank"
  | "matching"
  | "true_false"
  | "sentence_transformation"
  | "open_ended";

interface MatchingPair {
  left: string;
  right: string;
}

interface ExerciseFormProps {
  lessonId: string;
  exerciseId?: string;
  initialType?: ExerciseType;
  initialPrompt?: string;
  initialOptions?: string[];
  initialPairs?: MatchingPair[];
  initialKeys?: string[];
  initialOriginal?: string;
  initialReferenceAnswer?: string;
  redirectTo: string;
}

const EMPTY_OPTIONS = ["", "", "", ""];
const EMPTY_PAIRS: MatchingPair[] = [
  { left: "", right: "" },
  { left: "", right: "" },
];

export function ExerciseForm({
  lessonId,
  exerciseId,
  initialType = "multiple_choice",
  initialPrompt = "",
  initialOptions,
  initialPairs,
  initialKeys,
  initialOriginal = "",
  initialReferenceAnswer = "",
  redirectTo,
}: ExerciseFormProps) {
  const [type, setType] = useState<ExerciseType>(initialType);
  const [prompt, setPrompt] = useState(initialPrompt);
  // MC
  const [options, setOptions] = useState<string[]>(initialOptions ?? EMPTY_OPTIONS);
  const [correctOption, setCorrectOption] = useState(
    initialType === "multiple_choice" && initialKeys?.[0] ? initialKeys[0] : "",
  );
  // FIB
  const [fibKeys, setFibKeys] = useState<string[]>(
    initialType === "fill_in_blank" && initialKeys?.length ? initialKeys : [""],
  );
  // T/F
  const [tfKey, setTfKey] = useState<"true" | "false">(
    initialType === "true_false" && initialKeys?.[0] === "false" ? "false" : "true",
  );
  // Matching
  const initialMatchingPairs = initialType === "matching" ? initialPairs : EMPTY_PAIRS;
  const [pairs, setPairs] = useState<MatchingPair[]>(initialMatchingPairs ?? EMPTY_PAIRS);
  const [matchingKeyJson, setMatchingKeyJson] = useState(
    initialType === "matching" && initialKeys?.[0] ? initialKeys[0] : "",
  );
  // Sentence transformation
  const [originalText, setOriginalText] = useState(initialType === "sentence_transformation" ? initialOriginal : "");
  const initialStAnswers = initialType === "sentence_transformation" && initialKeys?.length ? initialKeys : [""];
  const [stAnswers, setStAnswers] = useState<string[]>(initialStAnswers);
  // Open-ended
  const [refAnswer, setRefAnswer] = useState(initialType === "open_ended" ? initialReferenceAnswer : "");

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
    if (type === "matching") {
      const filledPairs = pairs.filter((p) => p.left.trim() && p.right.trim());
      if (filledPairs.length < 2) return "Podaj co najmniej 2 pełne pary";
      if (!matchingKeyJson.trim()) return "Podaj poprawną mapę matchingu";
      let map: Record<string, string>;
      try {
        map = JSON.parse(matchingKeyJson) as Record<string, string>;
      } catch {
        return "Mapa matchingu musi być poprawnym JSON-em";
      }
      const leftIndices = new Set(Object.keys(map));
      if (leftIndices.size !== filledPairs.length) {
        return "Mapa musi zawierać każdy lewy indeks";
      }
      const validLeft = Array.from({ length: filledPairs.length }, (_, i) => String(i));
      const validRight = Array.from({ length: filledPairs.length }, (_, i) => String(i));
      for (const left of leftIndices) {
        if (!validLeft.includes(left)) return `Nieprawidłowy lewy indeks: ${left}`;
        const right = map[left];
        if (!right || !validRight.includes(right)) {
          return `Nieprawidłowy prawy indeks dla lewej strony ${left}: ${right}`;
        }
      }
    }
    if (type === "sentence_transformation") {
      if (!originalText.trim()) return "Podaj oryginalne zdanie";
      if (!stAnswers.some((k) => k.trim())) return "Podaj co najmniej jeden dopuszczalny wariant";
    }
    if (type === "open_ended") {
      if (!refAnswer.trim()) return "Podaj wzorcową odpowiedź";
    }
    return null;
  };

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);

    let payload: Record<string, unknown> = {};
    if (type === "multiple_choice") {
      payload = { options: options.filter((o) => o.trim()) };
    } else if (type === "matching") {
      payload = { pairs: pairs.filter((p) => p.left.trim() && p.right.trim()) };
    } else if (type === "sentence_transformation") {
      payload = { original: originalText.trim() };
    }

    let keys: string[];
    if (type === "multiple_choice") {
      keys = [correctOption];
    } else if (type === "fill_in_blank") {
      keys = fibKeys.filter((k) => k.trim());
    } else if (type === "true_false") {
      keys = [tfKey];
    } else if (type === "sentence_transformation") {
      keys = stAnswers.filter((k) => k.trim());
    } else if (type === "open_ended") {
      keys = [refAnswer.trim()];
    } else {
      keys = [matchingKeyJson.trim()];
    }

    const url = exerciseId ? `/api/admin/exercises/${exerciseId}` : "/api/admin/exercises";

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

  const setOption = (idx: number, val: string) => {
    setOptions((prev) => prev.map((o, i) => (i === idx ? val : o)));
  };

  const removeOption = (idx: number) => {
    const next = options.filter((_, i) => i !== idx);
    setOptions(next);
    if (correctOption === options[idx]) setCorrectOption("");
  };

  const setFibKey = (idx: number, val: string) => {
    setFibKeys((prev) => prev.map((k, i) => (i === idx ? val : k)));
  };

  const removeFibKey = (idx: number) => {
    setFibKeys((prev) => prev.filter((_, i) => i !== idx));
  };

  const setPair = (idx: number, side: "left" | "right", val: string) => {
    setPairs((prev) => prev.map((p, i) => (i === idx ? { ...p, [side]: val } : p)));
  };

  const removePair = (idx: number) => {
    setPairs((prev) => prev.filter((_, i) => i !== idx));
  };

  const setStAnswer = (idx: number, val: string) => {
    setStAnswers((prev) => prev.map((k, i) => (i === idx ? val : k)));
  };

  const removeStAnswer = (idx: number) => {
    setStAnswers((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-5">
      {error && (
        <div className="border-destructive bg-destructive/10 text-destructive rounded-md border px-4 py-2 text-sm">
          {error}
        </div>
      )}

      {/* Type */}
      <div className="space-y-1">
        <label htmlFor="exercise-type" className="text-sm font-medium">
          Typ ćwiczenia *
        </label>
        <select
          id="exercise-type"
          value={type}
          onChange={(e) => {
            setType(e.target.value as ExerciseType);
          }}
          className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm outline-none focus-visible:ring-[3px]"
        >
          <option value="multiple_choice">Wybór wielokrotny (Multiple Choice)</option>
          <option value="fill_in_blank">Uzupełnij lukę (Fill in the Blank)</option>
          <option value="true_false">Prawda / Fałsz (True/False)</option>
          <option value="matching">Dopasowanie (Matching)</option>
          <option value="sentence_transformation">Przekształcanie zdań</option>
          <option value="open_ended">Pytanie otwarte</option>
        </select>
      </div>

      {/* Prompt */}
      <div className="space-y-1">
        <label htmlFor="exercise-prompt" className="text-sm font-medium">
          Treść ćwiczenia *
          {type === "fill_in_blank" && (
            <span className="text-muted-foreground ml-2 text-xs font-normal">Użyj _____ jako oznaczenia luki</span>
          )}
        </label>
        <textarea
          id="exercise-prompt"
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
          }}
          rows={3}
          required
          className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 w-full resize-y rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-[3px]"
          placeholder={type === "fill_in_blank" ? "She _____ to school yesterday." : "Treść pytania lub polecenia…"}
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
                  onChange={() => {
                    if (opt.trim()) setCorrectOption(opt);
                  }}
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
                  className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-8 flex-1 rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-[3px]"
                />
                {options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => {
                      removeOption(idx);
                    }}
                    className="text-destructive text-xs hover:underline"
                  >
                    Usuń
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setOptions((prev) => [...prev, ""]);
            }}
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
            <span className="text-muted-foreground ml-2 text-xs font-normal">
              (wpisz wszystkie akceptowalne warianty)
            </span>
          </label>
          <div className="space-y-2">
            {fibKeys.map((key, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="text"
                  value={key}
                  onChange={(e) => {
                    setFibKey(idx, e.target.value);
                  }}
                  placeholder={`Odpowiedź ${idx + 1}`}
                  className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-8 flex-1 rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-[3px]"
                />
                {fibKeys.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      removeFibKey(idx);
                    }}
                    className="text-destructive text-xs hover:underline"
                  >
                    Usuń
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setFibKeys((prev) => [...prev, ""]);
            }}
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
                onChange={() => {
                  setTfKey("true");
                }}
              />
              Prawda
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="tf_key"
                value="false"
                checked={tfKey === "false"}
                onChange={() => {
                  setTfKey("false");
                }}
              />
              Fałsz
            </label>
          </div>
        </div>
      )}

      {/* Matching pairs */}
      {type === "matching" && (
        <div className="space-y-3">
          <label className="text-sm font-medium">Pary dopasowania *</label>
          <div className="space-y-2">
            {pairs.map((pair, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="text"
                  value={pair.left}
                  onChange={(e) => {
                    setPair(idx, "left", e.target.value);
                  }}
                  placeholder={`Lewa ${idx + 1}`}
                  className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-8 flex-1 rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-[3px]"
                />
                <span className="text-muted-foreground">↔</span>
                <input
                  type="text"
                  value={pair.right}
                  onChange={(e) => {
                    setPair(idx, "right", e.target.value);
                  }}
                  placeholder={`Prawa ${idx + 1}`}
                  className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-8 flex-1 rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-[3px]"
                />
                {pairs.length > 2 && (
                  <button
                    type="button"
                    onClick={() => {
                      removePair(idx);
                    }}
                    className="text-destructive text-xs hover:underline"
                  >
                    Usuń
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setPairs((prev) => [...prev, { left: "", right: "" }]);
            }}
            className="text-xs text-blue-600 hover:underline"
          >
            + Dodaj parę
          </button>

          <div className="space-y-1">
            <label htmlFor="matching-key" className="text-sm font-medium">
              Poprawna mapa (JSON) *
            </label>
            <input
              id="matching-key"
              type="text"
              value={matchingKeyJson}
              onChange={(e) => {
                setMatchingKeyJson(e.target.value);
              }}
              placeholder='{"0":"1","1":"0"}'
              className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-[3px]"
            />
            <p className="text-muted-foreground text-xs">
              Klucz: lewy indeks → prawy indeks, np. {"{"}0:1, 1:0{"}"} oznacza, że lewa 1 pasuje do prawej 2, a lewa 2
              do prawej 1.
            </p>
          </div>
        </div>
      )}

      {/* Sentence transformation */}
      {type === "sentence_transformation" && (
        <div className="space-y-3">
          <div className="space-y-1">
            <label htmlFor="st-original" className="text-sm font-medium">
              Oryginalne zdanie *
            </label>
            <textarea
              id="st-original"
              value={originalText}
              onChange={(e) => {
                setOriginalText(e.target.value);
              }}
              rows={2}
              required
              className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 w-full resize-y rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-[3px]"
              placeholder="Wpisz zdanie do przekształcenia…"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Dopuszczalne warianty *
              <span className="text-muted-foreground ml-2 text-xs font-normal">
                (wpisz wszystkie akceptowalne odpowiedzi)
              </span>
            </label>
            <div className="space-y-2">
              {stAnswers.map((key, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={key}
                    onChange={(e) => {
                      setStAnswer(idx, e.target.value);
                    }}
                    placeholder={`Wariant ${idx + 1}`}
                    className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-8 flex-1 rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-[3px]"
                  />
                  {stAnswers.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        removeStAnswer(idx);
                      }}
                      className="text-destructive text-xs hover:underline"
                    >
                      Usuń
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                setStAnswers((prev) => [...prev, ""]);
              }}
              className="text-xs text-blue-600 hover:underline"
            >
              + Dodaj wariant
            </button>
          </div>
        </div>
      )}

      {/* Open-ended */}
      {type === "open_ended" && (
        <div className="space-y-1">
          <label htmlFor="oe-reference" className="text-sm font-medium">
            Wzorcowa odpowiedź *
          </label>
          <textarea
            id="oe-reference"
            value={refAnswer}
            onChange={(e) => {
              setRefAnswer(e.target.value);
            }}
            rows={4}
            required
            className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 w-full resize-y rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-[3px]"
            placeholder="Wpisz wzorcową odpowiedź do samooceny…"
          />
        </div>
      )}

      {/* Submit */}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center rounded-md px-4 text-sm font-medium transition-colors disabled:opacity-50"
        >
          {submitting ? "Zapisywanie…" : exerciseId ? "Zapisz zmiany" : "Utwórz ćwiczenie"}
        </button>
        <a
          href={redirectTo}
          className="border-border text-muted-foreground hover:bg-muted inline-flex h-9 items-center rounded-md border px-4 text-sm transition-colors"
        >
          Anuluj
        </a>
      </div>
    </form>
  );
}
