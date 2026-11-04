import { Link, Navigate, Route, Routes } from "react-router-dom";

import AppLayout from "../components/common/AppLayout";
import AdminChapterEditPage from "../pages/admin/AdminChapterEditPage";
import AdminChaptersPage from "../pages/admin/AdminChaptersPage";
import AdminExamStructurePage from "../pages/admin/AdminExamStructurePage";
import AdminExtractionReviewPage from "../pages/admin/AdminExtractionReviewPage";
import AdminHomePage from "../pages/admin/AdminHomePage";
import AdminMaterialDetailPage from "../pages/admin/AdminMaterialDetailPage";
import AdminMaterialsPage from "../pages/admin/AdminMaterialsPage";
import AdminPreviousYearPage from "../pages/admin/AdminPreviousYearPage";
import AdminQuestionEditPage from "../pages/admin/AdminQuestionEditPage";
import AdminQuestionsPage from "../pages/admin/AdminQuestionsPage";
import AdminSubjectsPage from "../pages/admin/AdminSubjectsPage";
import AdminWrittenQuestionsPage from "../pages/admin/AdminWrittenQuestionsPage";
import AdminWrittenReviewPage from "../pages/admin/AdminWrittenReviewPage";
import LoginPage from "../pages/auth/LoginPage";
import RegisterPage from "../pages/auth/RegisterPage";
import DashboardPage from "../pages/dashboard/DashboardPage";
import ExamResultPage from "../pages/exams/ExamResultPage";
import ExamRoomPage from "../pages/exams/ExamRoomPage";
import ExamsPage from "../pages/exams/ExamsPage";
import WrittenExamRoomPage from "../pages/exams/WrittenExamRoomPage";
import PracticePage from "../pages/practice/PracticePage";
import ProfilePage from "../pages/profile/ProfilePage";
import WeakSpotsPage from "../pages/revision/WeakSpotsPage";
import ChapterPage from "../pages/subjects/ChapterPage";
import SubjectDetailPage from "../pages/subjects/SubjectDetailPage";
import SubjectsPage from "../pages/subjects/SubjectsPage";
import SetupCheckPage from "../pages/SetupCheckPage";
import AdminRoute from "./AdminRoute";
import GuestRoute from "./GuestRoute";
import ProtectedRoute from "./ProtectedRoute";
import ExamHistoryPage from "../pages/history/ExamHistoryPage";
import WrittenHistoryDetailPage from "../pages/history/WrittenHistoryDetailPage";

function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3">
      <h1 className="text-2xl font-bold">404 · Page not found</h1>
      <Link to="/dashboard" className="text-blue-700 underline">
        Go to dashboard
      </Link>
    </div>
  );
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/status" element={<SetupCheckPage />} />

      <Route element={<GuestRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        {/* Full-screen exam rooms: no sidebar, so nothing distracts from the exam */}
        <Route path="/exams/attempts/:attemptId" element={<ExamRoomPage />} />
        <Route path="/exams/written/:sessionId" element={<WrittenExamRoomPage />} />

        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/subjects" element={<SubjectsPage />} />
          <Route path="/subjects/:subjectId" element={<SubjectDetailPage />} />
          <Route path="/chapters/:chapterId" element={<ChapterPage />} />
          <Route path="/practice" element={<PracticePage />} />
          <Route path="/exams" element={<ExamsPage />} />
          <Route path="/exams/attempts/:attemptId/result" element={<ExamResultPage />} />
          <Route path="/weak-spots" element={<WeakSpotsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/exams/history" element={<ExamHistoryPage />} />
          <Route path="/exams/history/written/:sessionId" element={<WrittenHistoryDetailPage />} />
          <Route path="/exams/attempts/:attemptId/result" element={<ExamResultPage />} />

          <Route element={<AdminRoute />}>
            <Route path="/admin" element={<AdminHomePage />} />
            <Route path="/admin/subjects" element={<AdminSubjectsPage />} />
            <Route path="/admin/subjects/:subjectId/chapters" element={<AdminChaptersPage />} />
            <Route path="/admin/subjects/:subjectId/chapters/new" element={<AdminChapterEditPage />} />
            <Route path="/admin/chapters/:chapterId/edit" element={<AdminChapterEditPage />} />
            <Route path="/admin/exam-structure" element={<AdminExamStructurePage />} />
            <Route path="/admin/materials" element={<AdminMaterialsPage />} />
            <Route path="/admin/materials/:materialId" element={<AdminMaterialDetailPage />} />
            <Route path="/admin/previous-year" element={<AdminPreviousYearPage />} />
            <Route path="/admin/previous-year/:materialId/review" element={<AdminExtractionReviewPage />} />
            <Route path="/admin/previous-year/:materialId/written-review" element={<AdminWrittenReviewPage />} />
            <Route path="/admin/questions" element={<AdminQuestionsPage />} />
            <Route path="/admin/questions/new" element={<AdminQuestionEditPage />} />
            <Route path="/admin/questions/:questionId/edit" element={<AdminQuestionEditPage />} />
            <Route path="/admin/written-questions" element={<AdminWrittenQuestionsPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}