import { useState } from "react";

interface Props {
  exercise: {
    id: string;
    prompt: string;
  };
  initialReferenceAnswer?: string;
  disabled?: boolean;
}

export default function OpenEndedExercise({ exercise, initialReferenceAnswer, disabled = false }: Props) {
  const [answer, setAnswer] = useState("");
  const [showReference, setShowReference] = useState(false);

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <h3 className="mb-4 font-medium text-white">{exercise.prompt}</h3>

      <textarea
        value={answer}
        disabled={disabled || showReference}
        onChange={(e) => {
          if (!disabled && !showReference) {
            setAnswer(e.target.value);
          }
        }}
        placeholder="Wpisz swoją odpowiedź"
        rows={4}
        className="w-full resize-y rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
      />

      {!showReference && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setShowReference(true);
          }}
          className="mt-4 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Pokaż wzorzec
        </button>
      )}

      {showReference && (
        <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
          <p className="text-sm font-medium text-emerald-400">Wzorcowa odpowiedź</p>
          <p className="mt-1 text-sm text-slate-200">{initialReferenceAnswer ?? "Brak wzorcowej odpowiedzi."}</p>
        </div>
      )}
    </div>
  );
}
