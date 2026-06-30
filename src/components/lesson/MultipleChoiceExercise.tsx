import { useState } from "react";

interface Props {
  exercise: {
    id: string;
    prompt: string;
    payload: { options: string[] };
  };
  onCorrect: (exerciseId: string) => void;
  disabled?: boolean;
  initialCorrectAnswer?: string;
}
export default function MultipleChoiceExercise({ exercise, onCorrect, disabled = false, initialCorrectAnswer }: Props) {
  const [selected, setSelected] = useState<string | null>(initialCorrectAnswer ?? null);
  const [feedback, setFeedback] = useState<null | "correct" | "incorrect">(initialCorrectAnswer ? "correct" : null);
  const [locked, setLocked] = useState(!!initialCorrectAnswer);
  const [loading, setLoading] = useState(false);
  const isDisabled = disabled || locked;

  async function handleSubmit() {
    if (!selected || loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/exercises/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exercise_id: exercise.id, answer: selected }),
      });
      const data = (await res.json()) as { correct: boolean };
      if (!res.ok) {
        setFeedback("incorrect");
        return;
      }
      if (data.correct) {
        setFeedback("correct");
        setLocked(true);
        onCorrect(exercise.id);
      } else {
        setFeedback("incorrect");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <p className="mb-4 font-medium text-white">{exercise.prompt}</p>

      <div className="space-y-2">
        {exercise.payload.options.map((option) => {
          const isSelected = selected === option;
          const isCorrectLocked = locked && isSelected;
          return (
            <label
              key={option}
              className={[
                "flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm transition-colors",
                isDisabled ? "cursor-default" : "cursor-pointer",
                isCorrectLocked
                  ? "border-emerald-500 bg-emerald-500/10 text-emerald-300"
                  : isSelected
                    ? "border-blue-500 bg-blue-500/10 text-white"
                    : "border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:bg-white/10",
                isDisabled && !isSelected ? "opacity-50" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <input
                type="radio"
                name={`exercise-${exercise.id}`}
                value={option}
                checked={isSelected}
                disabled={isDisabled}
                onChange={() => {
                  if (!isDisabled) {
                    setSelected(option);
                    setFeedback(null);
                  }
                }}
                className="sr-only"
              />
              <span
                className={[
                  "h-4 w-4 shrink-0 rounded-full border-2",
                  isCorrectLocked
                    ? "border-emerald-400 bg-emerald-400"
                    : isSelected
                      ? "border-blue-400 bg-blue-400"
                      : "border-slate-500",
                ].join(" ")}
              />
              {option}
            </label>
          );
        })}
      </div>

      {feedback === "correct" && <p className="mt-3 text-sm font-medium text-emerald-400">✓ Poprawnie!</p>}
      {feedback === "incorrect" && <p className="mt-3 text-sm text-rose-400">✗ Niepoprawnie — spróbuj ponownie.</p>}

      {!locked && (
        <button
          type="button"
          disabled={!selected || loading || isDisabled}
          onClick={handleSubmit}
          className="mt-4 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Sprawdzanie…" : "Sprawdź"}
        </button>
      )}
    </div>
  );
}
