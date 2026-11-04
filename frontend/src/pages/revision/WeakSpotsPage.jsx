import { useState } from "react";

import { startRevision } from "../../api/revision.api";
import PracticeResults from "../practice/PracticeResults";
import PracticeSession from "../practice/PracticeSession";
import WeakSpotsOverview from "./WeakSpotsOverview";

// Three screens: overview -> session -> results. The session lives in memory, so refreshing
// the page during a session returns you to the overview. Answers already checked are saved.
export default function WeakSpotsPage() {
  const [stage, setStage] = useState("overview");
  const [questions, setQuestions] = useState([]);
  const [settings, setSettings] = useState(null);
  const [answers, setAnswers] = useState({});
  const [sessionId, setSessionId] = useState(0);

  function handleStart(newQuestions, newSettings) {
    setQuestions(newQuestions);
    setSettings(newSettings);
    setAnswers({});
    setSessionId((n) => n + 1);
    setStage("session");
  }

  function handleFinish(finalAnswers) {
    if (Object.keys(finalAnswers).length === 0) {
      setStage("overview"); // nothing was answered, so there is nothing to show
      return;
    }
    setAnswers(finalAnswers);
    setStage("results");
  }

  // Throws on failure (for example nothing is due any more) so the results screen shows the message
  async function handleRetry() {
    const response = await startRevision(settings);
    handleStart(response.questions, settings);
  }

  if (stage === "session") {
    return (
      <PracticeSession
        key={sessionId}
        mode="revision"
        questions={questions}
        onFinish={handleFinish}
      />
    );
  }

  if (stage === "results") {
    return (
      <PracticeResults
        mode="revision"
        questions={questions}
        answers={answers}
        onRetry={handleRetry}
        onNew={() => setStage("overview")}
      />
    );
  }

  return <WeakSpotsOverview onStart={handleStart} />;
}