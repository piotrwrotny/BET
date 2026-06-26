import { useState } from "react";
import MultipleChoiceExercise from "./MultipleChoiceExercise";

type Exercise = {
  id: string;
  type: string;
  prompt: string;
  payload: Record<string, unknown>;
  ord: number;
};

interface Props {
  lessonId: string;
  exercises: Exercise[];
  isAlreadyCompleted: boolean;
  closedExerciseCount: number;
}

export default function LessonInteractive({
  lessonId,
  exercises,
  isAlreadyCompleted,
  closedExerciseCount,
}: Props) {
  const [completedExercises, setCompletedExercises] = useState<Set<string>>(new Set());
  const [isCompleted, setIsCompleted] = useState(isAlreadyCompleted);
  const [completing, setCompleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function handleCorrect(exerciseId: string) {
    setCompletedExercises((prev) => new Set([...prev, exerciseId]));
  }

  async function handleMarkRead() {
    if (completedExercises.size < closedExerciseCount) {
      setErrorMessage("Ukończ najpierw wszystkie ćwiczenia zamknięte.");
      return;
    }
    setErrorMessage(null);
    setCompleting(true);
    try {
      const res = await fetch(`/api/lessons/${lessonId}/complete`, { method: "POST" });
      if (res.ok) {
        setIsCompleted(true);
      }
    } finally {
      setCompleting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Exercises */}
      {exercises.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-white">Ćwiczenia</h2>
          {exercises.map((ex) => {
            if (ex.type === "multiple_choice") {
              return (
                <MultipleChoiceExercise
                  key={ex.id}
                  exercise={
                    ex as unknown as {
                      id: string;
                      prompt: string;
                      payload: { options: string[] };
                    }
                  }
                  onCorrect={handleCorrect}
                  disabled={isCompleted}
                />
              );
            }
            // Other types — placeholder until S-06/S-07
            return (
              <div key={ex.id} className="rounded-xl border border-white/10 bg-white/5 p-5">
                <p className="mb-1 font-medium text-white">{ex.prompt}</p>
                <p className="text-xs text-slate-500">
                  [{ex.type}] — interaktywność dostępna wkrótce.
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Completion */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        {isCompleted ? (
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-emerald-500/20 px-4 py-2 text-sm font-medium text-emerald-400">
              ✓ Ukończona
            </span>
            <span className="text-sm text-slate-400">Lekcja zaliczona.</span>
          </div>
        ) : (
          <>
            <p className="mb-3 text-sm text-slate-400">
              Przeczytałeś lekcję? Kliknij przycisk aby ją oznaczyć jako ukończoną.
              {closedExerciseCount > 0 && " Wymagane ukończenie wszystkich ćwiczeń."}
            </p>
            {errorMessage && <p className="mb-3 text-sm text-rose-400">{errorMessage}</p>}
            <button
              type="button"
              disabled={completing}
              onClick={handleMarkRead}
              className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {completing ? "Zapisywanie…" : "Przeczytano"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
