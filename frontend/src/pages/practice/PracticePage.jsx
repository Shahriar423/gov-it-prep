import { useState } from "react";

import { startPractice } from "../../api/practice.api";
import PracticeResults from "./PracticeResults";
import PracticeSession from "./PracticeSession";
import PracticeSetup from "./PracticeSetup";

// Three screens: setup -> session -> results. The session lives in memory,
// so refreshing the page during a session returns you to the setup screen.
export default function PracticePage() {
  const [stage, setStage] = useState("setup");
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
      setStage("setup"); // nothing was answered, so there is nothing to show
      return;
    }
    setAnswers(finalAnswers);
    setStage("results");
  }

  // Throws on failure so the results screen can show the error message
  async function handleRetry() {
    const response = await startPractice(settings);
    handleStart(response.questions, settings);
  }

  if (stage === "session") {
    return <PracticeSession key={sessionId} questions={questions} onFinish={handleFinish} />;
  }
  if (stage === "results") {
    return (
      <PracticeResults
        questions={questions}
        answers={answers}
        onRetry={handleRetry}
        onNew={() => setStage("setup")}
      />
    );
  }
  return <PracticeSetup onStart={handleStart} />;
}