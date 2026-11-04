"""Project-wide constants. Change a list here and the backend (and the admin screens that
read it from the API) follow.

NOTE: students pick their target exam on the Register and Profile pages, which still use
their own copy of TARGET_EXAMS (backend/app/schemas/auth.py and frontend/src/utils/constants.js).
That field is optional profile information; the exam builder no longer filters by it."""

# Recruitment exams: now only optional metadata (student profile, source materials).
TARGET_EXAMS: tuple[str, ...] = (
    "Assistant Network Engineer",
    "Assistant Maintenance Engineer",
    "Assistant Programmer",
    "Bank IT Officer",
)

# (value stored in the database, label shown to admins)
MATERIAL_KINDS: tuple[tuple[str, str], ...] = (
    ("notes", "Study notes"),
    ("previous_year", "Previous-year paper"),
)

# ---------------------------------------------------------------- exam structure
# There are two exam categories. The three Non-Technical subjects are recognised by name
# (ignoring capital letters). EVERY OTHER SUBJECT IS TECHNICAL, and its chapters are the
# chapters a student can choose in the exam builder.
NON_TECHNICAL_SUBJECTS: tuple[str, ...] = ("Bangla", "English", "General Knowledge")


# "Create missing structure" (admin) adds these under a subject with this name.
# Canonical name for the main technical subject (formerly "Technical").
TECHNICAL_SUBJECT_NAME = "IT"
# Legacy name kept only so seed/migration can recognise old documents.
LEGACY_TECHNICAL_SUBJECT_NAME = "Technical"
TECHNICAL_CHAPTERS: tuple[str, ...] = (
    "Computer Fundamentals",
    "Operating Systems",
    "Computer Networks",
    "Database Management Systems",
    "Programming and Data Structures",
    "Software Engineering",
    "Data Communication",
    "Digital Logic",
    "Computer Architecture",
    "Web Technology",
    "Cyber Security",
    "Algorithms",
    "OOP",
    "System Analysis and Design",
)

# ---------------------------------------------------------------- exams
WRITTEN_MARKS_PER_QUESTION = 10   # every written question is worth exactly this many marks
MAX_WRITTEN_QUESTIONS = 20
MAX_MCQ_QUESTIONS = 100