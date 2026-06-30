import { useState } from "react";

interface Props {
  exercise: {
    id: string;
    prompt: string;
    payload: { original?: string };
  };
  onCorrect: (exerciseId: string) => void;
  disabled?: boolean;
  initialCorrectAnswer?: string;
}

export default function SentenceTransformationExercise({
  exercise,
  onCorrect,
  disabled = false,
  initialCorrectAnswer,
}: Props) {
  const [answer, setAnswer] = useState(initialCorrectAnswer ?? "");
  const [feedback, setFeedback] = useState<null | "correct" | "incorrect">(initialCorrectAnswer ? "correct" : null);
  const [locked, setLocked] = useState(!!initialCorrectAnswer);
  const [loading, setLoading] = useState(false);
  const isDisabled = disabled || locked;
  const original = exercise.payload.original?.trim() ?? exercise.prompt;

  async function handleSubmit() {
    if (!answer.trim() || loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/exercises/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exercise_id: exercise.id, answer: answer.trim() }),
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
      <p className="mb-4 text-sm text-slate-300">
        <span className="text-slate-500">Oryginalne zdanie:</span> {original}
      </p>

      <textarea
        value={answer}
        disabled={isDisabled}
        onChange={(e) => {
          if (!isDisabled) {
            setAnswer(e.target.value);
            setFeedback(null);
          }
        }}
        placeholder="Wpisz przekształcone zdanie"
        rows={3}
        className="w-full resize-y rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
      />

      {feedback === "correct" && <p className="mt-3 text-sm font-medium text-emerald-400">✓ Poprawnie!</p>}
      {feedback === "incorrect" && <p className="mt-3 text-sm text-rose-400">✗ Niepoprawnie — spróbuj ponownie.</p>}

      {!locked && (
        <button
          type="button"
          disabled={!answer.trim() || loading || isDisabled}
          onClick={handleSubmit}
          className="mt-4 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Sprawdzanie…" : "Sprawdź"}
        </button>
      )}
    </div>
  );
}
