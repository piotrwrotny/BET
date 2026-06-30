import { useState } from "react";

interface MatchingPair {
  left: string;
  right: string;
}

interface Props {
  exercise: {
    id: string;
    prompt: string;
    payload: { pairs: MatchingPair[] };
  };
  onCorrect: (exerciseId: string) => void;
  disabled?: boolean;
  initialCorrectAnswer?: string;
}

export default function MatchingExercise({ exercise, onCorrect, disabled = false, initialCorrectAnswer }: Props) {
  const pairs = exercise.payload.pairs;
  const initialMap = parseInitialMap(initialCorrectAnswer);
  const isReview = !!initialCorrectAnswer;

  const [connections, setConnections] = useState<Record<string, string | undefined>>(initialMap);
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [selectedRight, setSelectedRight] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<null | "correct" | "incorrect">(isReview ? "correct" : null);
  const [locked, setLocked] = useState(isReview);
  const [loading, setLoading] = useState(false);
  const isDisabled = disabled || locked;

  function parseInitialMap(raw?: string): Record<string, string> {
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw) as Record<string, string>;
      return typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  function connect(leftIndex: string, rightIndex: string) {
    setConnections((prev) => ({ ...prev, [leftIndex]: rightIndex }));
    setSelectedLeft(null);
    setSelectedRight(null);
  }

  function disconnect(leftIndex: string) {
    setConnections((prev) => {
      const { [leftIndex]: _removed, ...rest } = prev;
      return rest;
    });
  }

  async function handleSubmit() {
    if (loading) return;
    const leftIndices = pairs.map((_, i) => String(i));
    const complete = leftIndices.every((idx) => connections[idx] != null);
    if (!complete) {
      setFeedback("incorrect");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/exercises/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exercise_id: exercise.id, answer: JSON.stringify(connections) }),
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

  const leftIndices = pairs.map((_, i) => String(i));
  const isComplete = leftIndices.every((idx) => connections[idx] != null);

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <p className="mb-4 font-medium text-white">{exercise.prompt}</p>

      <div className="grid grid-cols-2 gap-4">
        {/* Left column */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-400">Lewa strona</p>
          {pairs.map((pair, idx) => {
            const index = String(idx);
            const isConnected = connections[index] != null;
            const isSelected = selectedLeft === index;
            return (
              <button
                key={`left-${index}`}
                type="button"
                disabled={isDisabled || isConnected}
                onClick={() => {
                  setSelectedLeft(index);
                }}
                className={[
                  "w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                  isConnected
                    ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                    : isSelected
                      ? "border-blue-500 bg-blue-500/10 text-white"
                      : "border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:bg-white/10",
                  isDisabled || isConnected ? "cursor-default" : "cursor-pointer",
                ].join(" ")}
              >
                {pair.left}
              </button>
            );
          })}
        </div>

        {/* Right column */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-400">Prawa strona</p>
          {pairs.map((pair, idx) => {
            const index = String(idx);
            const isConnected = Object.values(connections).some((v) => v === index);
            const isSelected = selectedRight === index;
            return (
              <button
                key={`right-${index}`}
                type="button"
                disabled={isDisabled || isConnected}
                onClick={() => {
                  setSelectedRight(index);
                }}
                className={[
                  "w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                  isConnected
                    ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                    : isSelected
                      ? "border-blue-500 bg-blue-500/10 text-white"
                      : "border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:bg-white/10",
                  isDisabled || isConnected ? "cursor-default" : "cursor-pointer",
                ].join(" ")}
              >
                {pair.right}
              </button>
            );
          })}
        </div>
      </div>

      {!locked && selectedLeft && selectedRight && (
        <button
          type="button"
          onClick={() => {
            connect(selectedLeft, selectedRight);
          }}
          className="mt-4 rounded-lg border border-blue-500 bg-blue-500/10 px-4 py-2 text-sm font-medium text-blue-300 transition-colors hover:bg-blue-500/20"
        >
          Połącz: {pairs[Number(selectedLeft)]?.left} ↔ {pairs[Number(selectedRight)]?.right}
        </button>
      )}

      {Object.keys(connections).length > 0 && (
        <div className="mt-4 space-y-1">
          <p className="text-xs font-medium text-slate-400">Połączenia:</p>
          <ul className="space-y-1">
            {Object.entries(connections).map(([left, right]) => (
              <li key={left} className="flex items-center gap-2 text-sm text-slate-300">
                <span>
                  {pairs[Number(left)]?.left} ↔ {pairs[Number(right)]?.right}
                </span>
                {!locked && (
                  <button
                    type="button"
                    onClick={() => {
                      disconnect(left);
                    }}
                    className="text-xs text-rose-400 hover:underline"
                  >
                    Usuń
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {feedback === "correct" && <p className="mt-3 text-sm font-medium text-emerald-400">✓ Poprawnie!</p>}
      {feedback === "incorrect" && (
        <p className="mt-3 text-sm text-rose-400">
          ✗ Niepoprawnie — upewnij się, że wszystkie pary są poprawnie połączone.
        </p>
      )}

      {!locked && (
        <button
          type="button"
          disabled={!isComplete || loading || isDisabled}
          onClick={handleSubmit}
          className="mt-4 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Sprawdzanie…" : "Sprawdź"}
        </button>
      )}
    </div>
  );
}
