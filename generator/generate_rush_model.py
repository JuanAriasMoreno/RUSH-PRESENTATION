"""
RUSH! database model generator.

Single source of truth for the RUSH! relational model. Running this script
produces, from the same definitions:

  * ../rush_schema.sql   MySQL 8.0 DDL (CREATE TABLE statements)
  * ../RUSH_ERD.mdj      StarUML 6 project with the ERD (entities, columns,
                         relationships, logical group frames)

Because both files come from the same table list, the SQL schema and the
StarUML diagram always describe the same database structure.

Usage:  python generate_rush_model.py
"""

import base64
import json
import os
import secrets

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.dirname(HERE)

LANG = "'ENGLISH','KOREAN'"
NOW = "CURRENT_TIMESTAMP"


# --------------------------------------------------------------------------
# DSL
# --------------------------------------------------------------------------
class Col:
    def __init__(self, name, type_, length="", pk=False, nullable=False,
                 unique=False, default=None, auto=False, on_update_now=False,
                 fk=None, generated=None, doc=""):
        self.name = name
        self.type = type_          # e.g. BIGINT UNSIGNED, VARCHAR, ENUM
        self.length = length       # e.g. 255, "'A','B'"
        self.pk = pk
        self.nullable = nullable
        self.unique = unique       # single-column UNIQUE
        self.default = default     # SQL literal / expression
        self.auto = auto
        self.on_update_now = on_update_now
        self.fk = fk               # FK(...) instance
        self.generated = generated  # SQL expression for STORED generated col
        self.doc = doc

    def sql_type(self):
        return f"{self.type}({self.length})" if self.length else self.type


class FK:
    """Foreign key + the ERD relationship it implies."""

    def __init__(self, table, column, on_delete, rel_name,
                 child_card="0..*", parent_card=None):
        self.table = table
        self.column = column
        self.on_delete = on_delete
        self.rel_name = rel_name
        self.child_card = child_card
        self.parent_card = parent_card  # None -> derived from nullability


class Table:
    def __init__(self, name, group, doc, cols, uniques=(), checks=(),
                 indexes=(), app_rules=()):
        self.name = name
        self.group = group
        self.doc = doc
        self.cols = cols
        self.uniques = list(uniques)     # (constraint_name, [cols])
        self.checks = list(checks)       # (constraint_name, expr)
        self.indexes = list(indexes)     # (index_name, [cols])
        self.app_rules = list(app_rules)  # rules enforced by the backend

    def col(self, name):
        return next(c for c in self.cols if c.name == name)

    @property
    def pk_cols(self):
        return [c for c in self.cols if c.pk]


def pk_id(name):
    return Col(name, "BIGINT UNSIGNED", pk=True, auto=True,
               doc="Surrogate primary key (AUTO_INCREMENT).")


def created_at():
    return Col("created_at", "DATETIME", default=NOW)


def updated_at():
    return Col("updated_at", "DATETIME", default=NOW, on_update_now=True)


def fk_col(name, table, ref_col, on_delete, rel_name, nullable=False,
           pk=False, child_card="0..*", parent_card=None, doc=""):
    return Col(name, "BIGINT UNSIGNED", pk=pk, nullable=nullable,
               fk=FK(table, ref_col, on_delete, rel_name, child_card,
                     parent_card), doc=doc)


# --------------------------------------------------------------------------
# Model
# --------------------------------------------------------------------------
G_USER = "User Management"
G_ROOM = "Rooms and Membership"
G_QUIZ = "Quiz Management"
G_QA = "Questions and Answers"
G_GAME = "Game Sessions"
G_VOCAB = "Translation and Vocabulary"
G_NOTIF = "Notifications"

TABLES = [
    # ---------------------------------------------------------------- users
    Table("user", G_USER,
          "Registered account. Email and username are unique; passwords are "
          "stored only as hashes. Email is immutable after registration.",
          [
              pk_id("user_id"),
              Col("full_name", "VARCHAR", 100),
              Col("username", "VARCHAR", 30, unique=True),
              Col("email", "VARCHAR", 255, unique=True,
                  doc="Immutable after registration (backend rule)."),
              Col("password_hash", "VARCHAR", 255,
                  doc="bcrypt/argon2 hash; never plain text."),
              Col("profile_picture_url", "VARCHAR", 2048, nullable=True),
              Col("description", "TEXT", nullable=True,
                  doc="Personal description shown on the profile."),
              Col("learning_language", "ENUM", LANG, nullable=True,
                  doc="Language the user is learning (not collected at "
                      "registration, so nullable)."),
              Col("account_role", "ENUM", "'USER','SUPERADMIN'",
                  default="'USER'"),
              created_at(),
              updated_at(),
          ],
          app_rules=["email cannot be changed after registration "
                     "(reject UPDATE of email in the backend)."]),

    Table("user_preferences", G_USER,
          "1:1 extension of user holding the two independent language "
          "settings. Row created in the same transaction as the user.",
          [
              fk_col("user_id", "user", "user_id", "CASCADE", "configures",
                     pk=True, child_card="1"),
              Col("interface_language", "ENUM", LANG, default="'ENGLISH'"),
              Col("translation_target_language", "ENUM", LANG,
                  default="'KOREAN'"),
              updated_at(),
          ],
          app_rules=["Insert the preferences row together with the user "
                     "row (exactly one per user)."]),

    # ---------------------------------------------------------------- rooms
    Table("room", G_ROOM,
          "Private room. All rooms are private: there is no visibility "
          "column. owner_user_id is the single source of truth for the owner.",
          [
              pk_id("room_id"),
              fk_col("owner_user_id", "user", "user_id", "CASCADE", "owns"),
              Col("name", "VARCHAR", 100),
              Col("description", "TEXT"),
              Col("cover_image_url", "VARCHAR", 2048),
              created_at(),
              updated_at(),
          ],
          app_rules=["Max 10 rooms per owner (count before INSERT, inside a "
                     "transaction).",
                     "Creating a room also inserts the owner's "
                     "room_membership row with role OWNER."]),

    Table("room_membership", G_ROOM,
          "Current members of a room (junction user <-> room). Rows are "
          "deleted when a user leaves or is removed; no history is kept.",
          [
              fk_col("room_id", "room", "room_id", "CASCADE", "has members",
                     pk=True, child_card="1..*"),
              fk_col("user_id", "user", "user_id", "CASCADE", "holds",
                     pk=True),
              Col("membership_role", "ENUM", "'OWNER','ADMIN','MEMBER'",
                  default="'MEMBER'"),
              Col("joined_at", "DATETIME", default=NOW),
              Col("owner_flag", "TINYINT", nullable=True,
                  generated="IF(membership_role = 'OWNER', 1, NULL)",
                  doc="STORED generated helper: 1 for the OWNER row, NULL "
                      "otherwise. UNIQUE(room_id, owner_flag) allows at most "
                      "one OWNER membership per room."),
          ],
          uniques=[("uq_room_membership_one_owner", ["room_id", "owner_flag"])],
          indexes=[("idx_room_membership_user", ["user_id"])],
          app_rules=["Max 40 memberships per room including the owner "
                     "(SELECT ... FOR UPDATE on the room, count, then "
                     "insert).",
                     "Only OWNER/ADMIN can remove members; any member can "
                     "leave (delete their own row).",
                     "The OWNER membership must belong to room.owner_user_id "
                     "and cannot be removed; the owner deletes the room "
                     "instead of leaving it."]),

    Table("room_invitation", G_ROOM,
          "Expiring invitation link. The URL (and its QR code) carries a "
          "random token; only its SHA-256 hash is stored.",
          [
              pk_id("invitation_id"),
              fk_col("room_id", "room", "room_id", "CASCADE", "issues"),
              fk_col("created_by_user_id", "user", "user_id", "CASCADE",
                     "creates"),
              fk_col("invited_user_id", "user", "user_id", "CASCADE",
                     "receives", nullable=True,
                     doc="Set when the invitation is addressed to a specific "
                         "registered user (triggers the invitation email); "
                         "NULL for a link shared externally."),
              Col("token_hash", "CHAR", 64, unique=True,
                  doc="SHA-256 (hex) of the token embedded in the link."),
              Col("expires_at", "DATETIME"),
              created_at(),
          ],
          checks=[("chk_room_invitation_expiry", "expires_at > created_at")],
          app_rules=["A link is valid only if expires_at > NOW(); joining "
                     "also re-checks the 40-member limit.",
                     "Only OWNER/ADMIN may create invitations (see open "
                     "questions)."]),

    Table("topic", G_ROOM,
          "Room topic. PREDEFINED topics are managed by a SUPERADMIN and have "
          "no creator; CUSTOM topics belong to the user who created them.",
          [
              pk_id("topic_id"),
              Col("name", "VARCHAR", 50),
              Col("topic_type", "ENUM", "'PREDEFINED','CUSTOM'"),
              fk_col("created_by_user_id", "user", "user_id", "CASCADE",
                     "creates", nullable=True,
                     doc="NULL for PREDEFINED topics; required for CUSTOM."),
              created_at(),
          ],
          uniques=[("uq_topic_creator_name", ["created_by_user_id", "name"])],
          app_rules=["topic_type = 'CUSTOM' <=> created_by_user_id IS NOT "
                     "NULL (MySQL forbids CHECK on a column used by a "
                     "cascading FK).",
                     "PREDEFINED topic names must be unique (NULL creator "
                     "is not covered by the UNIQUE key).",
                     "Only SUPERADMIN can create/edit PREDEFINED topics."]),

    Table("room_topic", G_ROOM,
          "Junction room <-> topic (N:M).",
          [
              fk_col("room_id", "room", "room_id", "CASCADE", "is tagged with",
                     pk=True),
              fk_col("topic_id", "topic", "topic_id", "CASCADE",
                     "describes", pk=True),
          ],
          indexes=[("idx_room_topic_topic", ["topic_id"])]),

    # ---------------------------------------------------------------- quizzes
    Table("quiz", G_QUIZ,
          "Quiz owned permanently by its creator. Exists independently of "
          "rooms. is_in_library = FALSE marks a quiz created directly from a "
          "room, which is not shown in the creator's personal library.",
          [
              pk_id("quiz_id"),
              fk_col("creator_user_id", "user", "user_id", "CASCADE",
                     "creates",
                     doc="Permanent owner; never updated (no ownership "
                         "transfer)."),
              Col("title", "VARCHAR", 150),
              Col("description", "TEXT"),
              Col("quiz_status", "ENUM", "'DRAFT','PUBLISHED'",
                  default="'DRAFT'"),
              Col("is_in_library", "BOOLEAN", default="TRUE",
                  doc="FALSE when the quiz was created from inside a room."),
              created_at(),
              updated_at(),
          ],
          app_rules=["Max 15 quizzes per creator.",
                     "creator_user_id is never updated.",
                     "Only the creator can delete the quiz and manage its "
                     "collaborators; creator and collaborators can edit "
                     "its content.",
                     "updated_at is refreshed whenever the quiz's questions, "
                     "options, pairs or media change (ON UPDATE only "
                     "covers the quiz row itself)."]),

    Table("quiz_collaborator", G_QUIZ,
          "Users invited by the quiz owner to edit its content (N:M).",
          [
              fk_col("quiz_id", "quiz", "quiz_id", "CASCADE",
                     "has collaborators", pk=True),
              fk_col("user_id", "user", "user_id", "CASCADE",
                     "collaborates on", pk=True),
              Col("added_at", "DATETIME", default=NOW),
          ],
          indexes=[("idx_quiz_collaborator_user", ["user_id"])],
          app_rules=["The creator cannot be added as a collaborator.",
                     "Room ADMINs get no implicit collaborator rights."]),

    Table("room_quiz", G_QUIZ,
          "Quizzes available in a room (N:M). Deleting a row only removes "
          "the quiz from that room.",
          [
              fk_col("room_id", "room", "room_id", "CASCADE", "offers",
                     pk=True),
              fk_col("quiz_id", "quiz", "quiz_id", "CASCADE", "is added to",
                     pk=True),
              Col("added_at", "DATETIME", default=NOW),
          ],
          indexes=[("idx_room_quiz_quiz", ["quiz_id"])],
          app_rules=["Only OWNER/ADMIN of the room can insert/delete rows."]),

    # ---------------------------------------------------------------- Q&A
    Table("question", G_QA,
          "Question of a quiz with its own time limit and points. "
          "correct_text_answer holds the single accepted answer for "
          "OPEN_ANSWER and FILL_IN_THE_BLANK questions.",
          [
              pk_id("question_id"),
              fk_col("quiz_id", "quiz", "quiz_id", "CASCADE", "contains"),
              Col("question_text", "TEXT",
                  doc="For FILL_IN_THE_BLANK the text contains the blank "
                      "marker (e.g. ___)."),
              Col("question_type", "ENUM",
                  "'MULTIPLE_CHOICE','TRUE_FALSE','OPEN_ANSWER',"
                  "'FILL_IN_THE_BLANK','MATCHING'"),
              Col("point_value", "INT UNSIGNED", default="100"),
              Col("time_limit_seconds", "SMALLINT UNSIGNED", default="30"),
              Col("display_order", "TINYINT UNSIGNED",
                  doc="1..25, unique per quiz (also caps a quiz at 25 "
                      "questions)."),
              Col("correct_text_answer", "VARCHAR", 255, nullable=True,
                  doc="Stored lowercase; compared with the lowercased "
                      "participant answer."),
              created_at(),
              updated_at(),
          ],
          uniques=[("uq_question_quiz_order", ["quiz_id", "display_order"])],
          checks=[
              ("chk_question_points", "point_value > 0"),
              ("chk_question_time_limit", "time_limit_seconds > 0"),
              ("chk_question_order", "display_order BETWEEN 1 AND 25"),
              ("chk_question_text_answer",
               "(question_type IN ('OPEN_ANSWER','FILL_IN_THE_BLANK') "
               "AND correct_text_answer IS NOT NULL) OR "
               "(question_type NOT IN ('OPEN_ANSWER','FILL_IN_THE_BLANK') "
               "AND correct_text_answer IS NULL)"),
          ],
          app_rules=["answer_option rows only for MULTIPLE_CHOICE / "
                     "TRUE_FALSE; matching_pair rows only for MATCHING.",
                     "MULTIPLE_CHOICE: 2..10 options, exactly one correct.",
                     "TRUE_FALSE: exactly two options ('TRUE','FALSE'), "
                     "exactly one correct.",
                     "MATCHING: at least 2 pairs.",
                     "A quiz can be PUBLISHED only if every question has a "
                     "complete correct answer."]),

    Table("answer_option", G_QA,
          "Selectable option for MULTIPLE_CHOICE and TRUE_FALSE questions.",
          [
              pk_id("option_id"),
              fk_col("question_id", "question", "question_id", "CASCADE",
                     "offers"),
              Col("option_text", "VARCHAR", 255),
              Col("is_correct", "BOOLEAN", default="FALSE"),
              Col("display_order", "TINYINT UNSIGNED",
                  doc="1..10, unique per question (caps options at 10)."),
              Col("correct_flag", "TINYINT", nullable=True,
                  generated="IF(is_correct, 1, NULL)",
                  doc="STORED generated helper; UNIQUE(question_id, "
                      "correct_flag) allows at most one correct option."),
          ],
          uniques=[("uq_answer_option_order", ["question_id", "display_order"]),
                   ("uq_answer_option_one_correct",
                    ["question_id", "correct_flag"])],
          checks=[("chk_answer_option_order", "display_order BETWEEN 1 AND 10")],
          app_rules=["At least one correct option (the UNIQUE key only "
                     "guarantees at most one)."]),

    Table("matching_pair", G_QA,
          "Correct left/right pair of a MATCHING question.",
          [
              pk_id("pair_id"),
              fk_col("question_id", "question", "question_id", "CASCADE",
                     "defines"),
              Col("left_item", "VARCHAR", 255),
              Col("right_item", "VARCHAR", 255),
              Col("display_order", "TINYINT UNSIGNED"),
          ],
          uniques=[("uq_matching_pair_order", ["question_id", "display_order"]),
                   ("uq_matching_pair_left", ["question_id", "left_item"]),
                   ("uq_matching_pair_right", ["question_id", "right_item"])],
          checks=[("chk_matching_pair_order", "display_order >= 1")]),

    Table("question_media", G_QA,
          "Image, audio or video attached to a question. Only the URL of the "
          "file in external cloud storage is stored.",
          [
              pk_id("media_id"),
              fk_col("question_id", "question", "question_id", "CASCADE",
                     "includes"),
              Col("media_type", "ENUM", "'IMAGE','AUDIO','VIDEO'"),
              Col("media_url", "VARCHAR", 2048),
              created_at(),
          ],
          app_rules=["Videos are validated/transcoded to max 720p before "
                     "the URL is stored."]),

    # ---------------------------------------------------------------- game
    Table("quiz_session", G_GAME,
          "One real-time play of a quiz inside a room, started by an "
          "OWNER/ADMIN who acts as host.",
          [
              pk_id("session_id"),
              fk_col("room_id", "room", "room_id", "CASCADE", "hosts"),
              fk_col("quiz_id", "quiz", "quiz_id", "CASCADE", "is played in"),
              fk_col("host_user_id", "user", "user_id", "SET NULL",
                     "hosts", nullable=True,
                     doc="NULL if the host later deletes their account (keeps "
                         "the other participants' history)."),
              Col("session_status", "ENUM",
                  "'WAITING','IN_PROGRESS','COMPLETED','CANCELLED'",
                  default="'WAITING'"),
              created_at(),
              Col("started_at", "DATETIME", nullable=True),
              Col("ended_at", "DATETIME", nullable=True),
              Col("active_flag", "TINYINT", nullable=True,
                  generated="IF(session_status IN ('WAITING','IN_PROGRESS'), "
                            "1, NULL)",
                  doc="STORED generated helper: 1 while the session is "
                      "active, NULL otherwise. UNIQUE(room_id, active_flag) "
                      "=> one active session per room. (Not derived from "
                      "room_id: InnoDB rejects a generated column whose base "
                      "column is a cascading FK.)"),
          ],
          uniques=[("uq_quiz_session_one_active",
                    ["room_id", "active_flag"])],
          checks=[("chk_quiz_session_times",
                   "ended_at IS NULL OR started_at IS NULL "
                   "OR ended_at >= started_at")],
          app_rules=["Only OWNER/ADMIN of the room can create a session.",
                     "Participants are inserted only while status = "
                     "'WAITING'; none after IN_PROGRESS.",
                     "The quiz must be associated with the room "
                     "(room_quiz) and PUBLISHED."]),

    Table("quiz_attempt", G_GAME,
          "Participation of one user in one session; stores the final score.",
          [
              pk_id("attempt_id"),
              fk_col("session_id", "quiz_session", "session_id", "CASCADE",
                     "has participants"),
              fk_col("user_id", "user", "user_id", "CASCADE", "participates"),
              Col("total_score", "INT UNSIGNED", default="0",
                  doc="Final score written when the session ends "
                      "(= SUM(user_answer.points_earned))."),
              Col("joined_at", "DATETIME", default=NOW),
              Col("disconnected_at", "DATETIME", nullable=True,
                  doc="Set on disconnect; the participant cannot rejoin."),
          ],
          uniques=[("uq_quiz_attempt_session_user", ["session_id", "user_id"])],
          indexes=[("idx_quiz_attempt_user", ["user_id"])],
          app_rules=["Participant must be a room member when the session "
                     "starts."]),

    Table("user_answer", G_GAME,
          "Answer submitted by a participant to one question, with its "
          "evaluated correctness and points.",
          [
              pk_id("user_answer_id"),
              fk_col("attempt_id", "quiz_attempt", "attempt_id", "CASCADE",
                     "submits"),
              fk_col("question_id", "question", "question_id", "CASCADE",
                     "is answered in"),
              fk_col("selected_option_id", "answer_option", "option_id",
                     "SET NULL", "is selected in", nullable=True,
                     doc="MULTIPLE_CHOICE / TRUE_FALSE."),
              Col("text_answer", "VARCHAR", 255, nullable=True,
                  doc="OPEN_ANSWER / FILL_IN_THE_BLANK, as typed."),
              Col("is_correct", "BOOLEAN", default="FALSE"),
              Col("points_earned", "INT UNSIGNED", default="0"),
              Col("answered_at", "DATETIME", default=NOW),
          ],
          uniques=[("uq_user_answer_attempt_question",
                    ["attempt_id", "question_id"])],
          app_rules=["question must belong to the session's quiz.",
                     "By question type: selected_option_id for "
                     "MULTIPLE_CHOICE / TRUE_FALSE, text_answer for "
                     "OPEN_ANSWER / FILL_IN_THE_BLANK, user_answer_match rows "
                     "for MATCHING (not a CHECK: MySQL forbids CHECK on a "
                     "column used by a SET NULL foreign key).",
                     "Answers are accepted only within the question's time "
                     "limit."]),

    Table("user_answer_match", G_GAME,
          "For MATCHING questions: which right item the participant "
          "matched to each left item. Correct when left_pair_id = "
          "selected_right_pair_id.",
          [
              fk_col("user_answer_id", "user_answer", "user_answer_id",
                     "CASCADE", "details", pk=True),
              fk_col("left_pair_id", "matching_pair", "pair_id", "CASCADE",
                     "is left item of", pk=True),
              fk_col("selected_right_pair_id", "matching_pair", "pair_id",
                     "CASCADE", "is chosen right item of"),
          ],
          indexes=[("idx_user_answer_match_right", ["selected_right_pair_id"])],
          app_rules=["Both pairs must belong to the answered question."]),

    # ---------------------------------------------------------------- vocab
    Table("translation_cache", G_VOCAB,
          "Shared translation of one word in one direction (Google "
          "Translate) plus the OpenAI contextual explanation. Reused by all "
          "users to avoid repeated API calls.",
          [
              pk_id("translation_id"),
              Col("source_word", "VARCHAR", 100,
                  doc="Normalized (trimmed, lowercase for English). "
                      "Binary collation."),
              Col("source_language", "ENUM", LANG),
              Col("target_language", "ENUM", LANG),
              Col("translated_word", "VARCHAR", 255),
              Col("contextual_explanation", "TEXT", nullable=True,
                  doc="NULL until/unless the OpenAI call succeeds."),
              created_at(),
          ],
          uniques=[("uq_translation_cache_word",
                    ["source_word", "source_language", "target_language"])],
          checks=[("chk_translation_cache_direction",
                   "source_language <> target_language")]),

    Table("saved_word", G_VOCAB,
          "A user's personal vocabulary entry (also the translation "
          "history). Personal data only; the translation itself is shared "
          "and read-only.",
          [
              pk_id("saved_word_id"),
              fk_col("user_id", "user", "user_id", "CASCADE", "saves"),
              fk_col("translation_id", "translation_cache", "translation_id",
                     "RESTRICT", "is saved as"),
              Col("personal_note", "TEXT", nullable=True),
              Col("is_favorite", "BOOLEAN", default="FALSE"),
              Col("saved_at", "DATETIME", default=NOW),
              Col("last_looked_up_at", "DATETIME", default=NOW,
                  doc="Updated each time the user looks the word up again."),
          ],
          uniques=[("uq_saved_word_user_translation",
                    ["user_id", "translation_id"])],
          app_rules=["Search and export are queries over saved_word JOIN "
                     "translation_cache."]),
]

TABLE_BY_NAME = {t.name: t for t in TABLES}

# --------------------------------------------------------------------------
# Diagram layout (top-left corner of each entity, in px)
# --------------------------------------------------------------------------
POS = {
    # Rooms and Membership (left)
    "room_membership":   (560, 140),
    "room_topic":        (60, 330),
    "room":              (560, 330),
    "topic":             (60, 560),
    "room_invitation":   (560, 560),
    # User Management (centre top)
    "user":              (1170, 140),
    "user_preferences":  (1700, 140),
    # Translation and Vocabulary (right top)
    "translation_cache": (2330, 140),
    "saved_word":        (2330, 420),
    # Quiz Management (centre)
    "room_quiz":         (1170, 640),
    "quiz":              (1520, 640),
    "quiz_collaborator": (2000, 640),
    # Game Sessions (bottom left)
    "quiz_session":      (60, 1020),
    "quiz_attempt":      (700, 1020),
    "user_answer":       (640, 1300),
    "user_answer_match": (640, 1620),
    # Questions and Answers (bottom right)
    "question":          (1170, 1020),
    "answer_option":     (1170, 1300),
    "matching_pair":     (1680, 1560),
    "question_media":    (2150, 1300),
}

# Optional intermediate bend points for relationships that would otherwise
# overlap or cross an entity. Key: (child_table, fk_column).
BENDS = {
    ("user_answer_match", "selected_right_pair_id"): [(1120, 1760),
                                                      (1790, 1760)],
}

GROUP_STYLE = {
    G_USER:  "#e8f1fc",
    G_ROOM:  "#eaf7ea",
    G_QUIZ:  "#fff4e0",
    G_QA:    "#fdecea",
    G_GAME:  "#f1ebfa",
    G_VOCAB: "#e6f6f6",
    G_NOTIF: "#f2f2f2",
}

NOTIFICATION_NOTE = (
    "Notifications: no table.\n"
    "The 4 email notifications (room invitation, removal from a room,\n"
    "quiz added to a room, session started) are sent by the backend at the\n"
    "moment the event happens. Recipients come from existing tables:\n"
    "room_invitation.invited_user_id, the room_membership row (read before\n"
    "deleting it), room_membership of the room, quiz_attempt of the session.\n"
    "No in-app inbox, read status or history is required, so a\n"
    "NOTIFICATION entity would add no functionality."
)

# --------------------------------------------------------------------------
# SQL generation
# --------------------------------------------------------------------------


def q(name):
    return f"`{name}`"


def col_sql(c):
    parts = [q(c.name), c.sql_type()]
    if c.name == "source_word":
        parts.append("CHARACTER SET utf8mb4 COLLATE utf8mb4_bin")
    if c.generated:
        parts.append(f"GENERATED ALWAYS AS ({c.generated}) STORED")
        parts.append("NULL" if c.nullable else "NOT NULL")
        return " ".join(parts)
    parts.append("NULL" if c.nullable else "NOT NULL")
    if c.auto:
        parts.append("AUTO_INCREMENT")
    if c.default is not None:
        parts.append(f"DEFAULT {c.default}")
    if c.on_update_now:
        parts.append("ON UPDATE CURRENT_TIMESTAMP")
    return " ".join(parts)


def build_sql():
    out = []
    out.append("-- ======================================================"
               "====================")
    out.append("-- RUSH! - MySQL 8.0 schema")
    out.append("-- Generated by generator/generate_rush_model.py from the "
               "same definitions as RUSH_ERD.mdj.")
    out.append("-- Requires MySQL 8.0.16+ (CHECK constraints are enforced).")
    out.append("-- ======================================================"
               "====================")
    out.append("")
    out.append("CREATE DATABASE IF NOT EXISTS `rush` CHARACTER SET utf8mb4 "
               "COLLATE utf8mb4_0900_ai_ci;")
    out.append("USE `rush`;")
    out.append("")
    out.append("SET FOREIGN_KEY_CHECKS = 0;")
    for t in reversed(TABLES):
        out.append(f"DROP TABLE IF EXISTS {q(t.name)};")
    out.append("SET FOREIGN_KEY_CHECKS = 1;")
    out.append("")

    for t in TABLES:
        out.append(f"-- {'-' * 70}")
        out.append(f"-- {t.name}  [{t.group}]")
        out.append(f"-- {t.doc}")
        for r in t.app_rules:
            out.append(f"--   APP RULE: {r}")
        out.append(f"-- {'-' * 70}")
        lines = [f"  {col_sql(c)}" for c in t.cols]
        lines.append(f"  CONSTRAINT {q('pk_' + t.name)} PRIMARY KEY "
                     f"({', '.join(q(c.name) for c in t.pk_cols)})")
        for c in t.cols:
            if c.unique:
                lines.append(f"  CONSTRAINT {q('uq_' + t.name + '_' + c.name)}"
                             f" UNIQUE ({q(c.name)})")
        for name, cols in t.uniques:
            lines.append(f"  CONSTRAINT {q(name)} UNIQUE "
                         f"({', '.join(q(x) for x in cols)})")
        for name, cols in t.indexes:
            lines.append(f"  INDEX {q(name)} ({', '.join(q(x) for x in cols)})")
        for c in t.cols:
            if c.fk:
                lines.append(
                    f"  CONSTRAINT {q('fk_' + t.name + '_' + c.name)} "
                    f"FOREIGN KEY ({q(c.name)}) REFERENCES {q(c.fk.table)} "
                    f"({q(c.fk.column)}) ON DELETE {c.fk.on_delete} "
                    f"ON UPDATE RESTRICT")
        for name, expr in t.checks:
            lines.append(f"  CONSTRAINT {q(name)} CHECK ({expr})")
        out.append(f"CREATE TABLE {q(t.name)} (")
        out.append(",\n".join(lines))
        out.append(") ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 "
                   "COLLATE = utf8mb4_0900_ai_ci;")
        out.append("")
    return "\n".join(out)


# --------------------------------------------------------------------------
# StarUML .mdj generation
# --------------------------------------------------------------------------


def new_id():
    return base64.b64encode(secrets.token_bytes(12)).decode()


def ref(obj):
    return {"$ref": obj["_id"]}


# Text metrics approximating StarUML's Arial 13px rendering.
CHAR_W = 7.0
ROW_H = 16
HEADER_H = 36


def entity_size(t):
    def key(c):
        k = "PK" if c.pk else ""
        if c.fk:
            k = (k + ",FK") if k else "FK"
        if not c.pk and c.nullable:
            k = (k + ",N") if k else "N"
        if not c.pk and c.unique:
            k = (k + ",U") if k else "U"
        return k
    kw = max(len(key(c)) for c in t.cols) * CHAR_W
    nw = max(len(c.name) for c in t.cols) * CHAR_W
    tw = max(len(c.sql_type()) for c in t.cols) * CHAR_W
    w = int(kw + nw + tw + 80)
    w = max(w, int(len(t.name) * 8 + 40))
    h = HEADER_H + len(t.cols) * ROW_H
    return w, h


def column_doc(c):
    bits = []
    if c.default is not None:
        bits.append(f"DEFAULT {c.default}")
    if c.on_update_now:
        bits.append("ON UPDATE CURRENT_TIMESTAMP")
    if c.auto:
        bits.append("AUTO_INCREMENT")
    if c.generated:
        bits.append(f"GENERATED ALWAYS AS ({c.generated}) STORED")
    if c.fk:
        bits.append(f"FK -> {c.fk.table}.{c.fk.column} "
                    f"ON DELETE {c.fk.on_delete}")
    if c.doc:
        bits.append(c.doc)
    return "\n".join(bits)


def entity_doc(t):
    lines = [t.doc]
    if t.uniques:
        lines.append("")
        lines.append("Composite UNIQUE constraints:")
        lines += [f"- {n} ({', '.join(cs)})" for n, cs in t.uniques]
    if t.checks:
        lines.append("")
        lines.append("CHECK constraints:")
        lines += [f"- {n}: {e}" for n, e in t.checks]
    if t.app_rules:
        lines.append("")
        lines.append("Application-level rules:")
        lines += [f"- {r}" for r in t.app_rules]
    return "\n".join(lines)


def build_mdj():
    project = {"_type": "Project", "_id": new_id(), "name": "RUSH!",
               "documentation": "RUSH! - relational model (MySQL 8.0). "
                                "Generated by generator/generate_rush_model.py",
               "ownedElements": []}
    root = {"_type": "ERDDataModel", "_id": new_id(), "_parent": ref(project),
            "name": "RUSH! Data Model", "ownedElements": []}
    project["ownedElements"].append(root)

    diagram = {"_type": "ERDDiagram", "_id": new_id(), "_parent": ref(root),
               "name": "RUSH! ERD", "visible": True, "defaultDiagram": True,
               "ownedViews": []}
    root["ownedElements"].append(diagram)

    # One sub data model per logical group (acts as a package in the
    # Model Explorer).
    groups = {}
    for g in [G_USER, G_ROOM, G_QUIZ, G_QA, G_GAME, G_VOCAB]:
        dm = {"_type": "ERDDataModel", "_id": new_id(), "_parent": ref(root),
              "name": g, "ownedElements": []}
        root["ownedElements"].append(dm)
        groups[g] = dm

    entities, columns = {}, {}
    for t in TABLES:
        e = {"_type": "ERDEntity", "_id": new_id(),
             "_parent": ref(groups[t.group]), "name": t.name,
             "documentation": entity_doc(t), "ownedElements": [],
             "columns": []}
        for c in t.cols:
            col = {"_type": "ERDColumn", "_id": new_id(), "_parent": ref(e),
                   "name": c.name, "type": c.type,
                   "length": str(c.length) if c.length else "",
                   "primaryKey": c.pk, "foreignKey": bool(c.fk),
                   "nullable": c.nullable, "unique": c.unique}
            d = column_doc(c)
            if d:
                col["documentation"] = d
            e["columns"].append(col)
            columns[(t.name, c.name)] = col
        groups[t.group]["ownedElements"].append(e)
        entities[t.name] = e

    # FK references + relationships
    relationships = []
    for t in TABLES:
        for c in t.cols:
            if not c.fk:
                continue
            columns[(t.name, c.name)]["referenceTo"] = ref(
                columns[(c.fk.table, c.fk.column)])
            parent = entities[c.fk.table]
            child = entities[t.name]
            parent_card = c.fk.parent_card or ("0..1" if c.nullable else "1")
            rel = {"_type": "ERDRelationship", "_id": new_id(),
                   "_parent": ref(child), "name": c.fk.rel_name,
                   "documentation": f"{c.fk.table} ({parent_card}) -- "
                                    f"{t.name} ({c.fk.child_card}) via "
                                    f"{t.name}.{c.name}",
                   "identifying": c.pk}
            rel["end1"] = {"_type": "ERDRelationshipEnd", "_id": new_id(),
                           "_parent": ref(rel), "reference": ref(parent),
                           "cardinality": parent_card}
            rel["end2"] = {"_type": "ERDRelationshipEnd", "_id": new_id(),
                           "_parent": ref(rel), "reference": ref(child),
                           "cardinality": c.fk.child_card}
            child["ownedElements"].append(rel)
            relationships.append((rel, c.fk.table, t.name, c.name))

    # ---- views
    sizes = {t.name: entity_size(t) for t in TABLES}

    def text_view(x, y, w, h, text, bold=False, size=13):
        return {"_type": "UMLTextView", "_id": new_id(),
                "_parent": ref(diagram),
                "font": f"Arial;{size};{1 if bold else 0}",
                "left": x, "top": y, "width": w, "height": h,
                "text": text, "wordWrap": True}

    # group frames first so they are drawn behind entities
    pad, title_h = 30, 34
    for g in [G_USER, G_ROOM, G_QUIZ, G_QA, G_GAME, G_VOCAB]:
        members = [t.name for t in TABLES if t.group == g]
        x1 = min(POS[m][0] for m in members) - pad
        y1 = min(POS[m][1] for m in members) - pad - title_h
        x2 = max(POS[m][0] + sizes[m][0] for m in members) + pad
        y2 = max(POS[m][1] + sizes[m][1] for m in members) + pad
        frame = {"_type": "RectangleView", "_id": new_id(),
                 "_parent": ref(diagram), "fillColor": GROUP_STYLE[g],
                 "lineColor": "#9aa5b1", "left": x1, "top": y1,
                 "width": x2 - x1, "height": y2 - y1}
        diagram["ownedViews"].append(frame)
        diagram["ownedViews"].append(
            text_view(x1 + 14, y1 + 10, 400, 22, g, bold=True, size=16))

    # notifications note (no table)
    nx, ny = 2150, 1560
    frame = {"_type": "RectangleView", "_id": new_id(),
             "_parent": ref(diagram), "fillColor": GROUP_STYLE[G_NOTIF],
             "lineColor": "#9aa5b1", "left": nx, "top": ny,
             "width": 560, "height": 200}
    diagram["ownedViews"].append(frame)
    diagram["ownedViews"].append(
        text_view(nx + 14, ny + 10, 400, 22, G_NOTIF, bold=True, size=16))
    diagram["ownedViews"].append(
        text_view(nx + 14, ny + 40, 530, 150, NOTIFICATION_NOTE))

    # title
    diagram["ownedViews"].append(text_view(
        60, 20, 1400, 30,
        "RUSH! - Entity Relationship Diagram (MySQL 8.0)", bold=True,
        size=22))
    diagram["ownedViews"].append(text_view(
        60, 54, 1600, 20,
        "Key column: PK primary key, FK foreign key, N nullable, U unique.  "
        "Solid line = identifying relationship (FK is part of the PK), "
        "dashed = non-identifying.  Crow's foot notation."))

    entity_views = {}
    for t in TABLES:
        x, y = POS[t.name]
        w, h = sizes[t.name]
        v = {"_type": "ERDEntityView", "_id": new_id(),
             "_parent": ref(diagram), "model": ref(entities[t.name]),
             "left": x, "top": y, "width": w, "height": h}
        diagram["ownedViews"].append(v)
        entity_views[t.name] = v

    for rel, parent_name, child_name, fk_column in relationships:
        tv, hv = entity_views[parent_name], entity_views[child_name]
        p1 = (tv["left"] + tv["width"] // 2, tv["top"] + tv["height"] // 2)
        p2 = (hv["left"] + hv["width"] // 2, hv["top"] + hv["height"] // 2)
        # BENDS are listed from the child side; the edge runs parent -> child.
        bends = BENDS.get((child_name, fk_column), [])
        pts = [p1] + bends[::-1] + [p2]
        v = {"_type": "ERDRelationshipView", "_id": new_id(),
             "_parent": ref(diagram), "model": ref(rel),
             "tail": ref(tv), "head": ref(hv), "lineStyle": 1,
             "points": ";".join(f"{x}:{y}" for x, y in pts)}
        diagram["ownedViews"].append(v)

    return project


# --------------------------------------------------------------------------
# Markdown documentation
# --------------------------------------------------------------------------
DOC_INTRO = """# RUSH! — Database Design

MySQL 8.0 (8.0.16+) relational model for **RUSH!**, a web app for learning
English and Korean through private rooms and real-time multiplayer quizzes.

| File | Content |
|---|---|
| `RUSH_ERD.mdj` | StarUML 6 project: diagram **RUSH! ERD**, with entities grouped by area in the Model Explorer |
| `rush_schema.sql` | MySQL DDL (`CREATE TABLE`) |
| `RUSH_Database_Design.md` | This document |
| `generator/generate_rush_model.py` | Single source of truth: regenerates the three files above |
| `generator/test_schema.sh` | Behavioural tests of the schema on a MySQL 8 server (Docker) |

All three outputs come from the same table definitions, so the diagram, the SQL
and this document always match. **To change the model, edit the generator and run**
`python generator/generate_rush_model.py`. Editing the `.mdj` or `.sql` by hand
would make them drift apart.

**Reading the diagram:** the key column shows `PK` (primary key), `FK` (foreign key),
`N` (nullable) and `U` (unique). Crow's-foot notation. A solid line is an *identifying*
relationship (the FK is part of the child's PK); a dashed line is non-identifying.
Defaults, composite UNIQUE/CHECK constraints and application rules are in each
element's **Documentation** field in StarUML.

**Conventions:** singular `snake_case` names, `BIGINT UNSIGNED AUTO_INCREMENT`
surrogate keys named `<entity>_id` (short form for compound names, e.g.
`option_id` in `answer_option`, `session_id` in `quiz_session`), FK columns
named after the referenced key or its role (`owner_user_id`, `host_user_id`),
composite keys for junction tables,
`created_at` / `updated_at` as `DATETIME`, URLs as `VARCHAR(2048)` (media lives in
external cloud storage), and `utf8mb4` everywhere so Korean text is supported.
"""

DOC_DECISIONS = """## 3. Key design decisions

1. **Twenty tables instead of the 22 proposed.**
   * `QUESTION_ACCEPTED_ANSWER` was merged into `question.correct_text_answer`. The spec says
     OPEN_ANSWER and FILL_IN_THE_BLANK have exactly **one** correct answer, so a 1:N table added
     nothing. A CHECK requires this column for those two types and forbids it for the others.
   * `NOTIFICATION` was left out. The four email notifications are sent when the event happens,
     and their recipients can be read from existing tables. Nothing requires an inbox, read
     status or history. The diagram has a *Notifications* frame that explains this.
2. **TRUE_FALSE uses `answer_option`.** It is stored as two option rows ("TRUE"/"FALSE"),
   so one mechanism serves both choice-based types.
3. **One answer table, typed by question.** `user_answer` stores `selected_option_id`
   (choice types) or `text_answer` (text types). MATCHING details go in
   `user_answer_match`, one row per left item. `is_correct` and `points_earned` are stored when
   the answer is evaluated, so history does not depend on later edits to the quiz.
4. **Room owner.** `room.owner_user_id` is the single source of truth (exactly one owner,
   enforced by `NOT NULL`). The owner also has a `room_membership` row with role `OWNER`,
   so the 40-member limit counts the owner. The stored generated column
   `owner_flag` + `UNIQUE(room_id, owner_flag)` allows at most one OWNER row per room.
5. **DB-level guards built from generated columns and CHECKs:**
   * `quiz_session.active_flag` + UNIQUE(room_id, active_flag) → at most **one active session per room**.
   * `answer_option.correct_flag` + UNIQUE → at most **one correct option** per question.
   * `display_order` CHECK 1..25 + UNIQUE per quiz → at most **25 questions** per quiz.
   * `display_order` CHECK 1..10 + UNIQUE per question → at most **10 options** per question.
6. **Personal library vs. room-created quizzes.** `quiz.is_in_library` (default TRUE) is set
   to FALSE when a quiz is created from inside a room. The quiz still exists and still
   belongs to its creator; it is just hidden from their library view. See open question Q3.
7. **Invitations.** Only a SHA-256 hash of the token is stored (`token_hash`, UNIQUE), the same
   way passwords are stored as hashes. The URL/QR code carries the raw token.
   `invited_user_id` is nullable: when set, the invitation is addressed to a registered
   user and triggers the invitation email; when NULL, it is a link shared externally.
8. **Shared translation vs. personal vocabulary.** `translation_cache` holds one row per
   (word, source language, target language) and is shared by everyone, which avoids repeated
   Google Translate/OpenAI calls. `saved_word` holds only personal data (note, favourite,
   dates) and is unique per (user, translation). FK uses `RESTRICT` so a cache entry in use
   cannot be purged.
9. **Deletion behaviour.** Almost every FK is `ON DELETE CASCADE`, which gives the required
   clean-up without orphans:
   * deleting a **user** removes their preferences, owned rooms, quizzes, memberships,
     collaborations, invitations, custom topics, attempts and saved words;
   * deleting a **room** removes memberships, invitations, room_topic, room_quiz and its
     sessions. Quizzes are untouched;
   * deleting a **quiz** removes questions → options/pairs/media, room_quiz rows and its
     sessions (history need not be kept).
   Exceptions: `quiz_session.host_user_id` is `SET NULL`, so a host deleting their account
   does not erase other players' results; `user_answer.selected_option_id` is `SET NULL`;
   `saved_word.translation_id` is `RESTRICT`.
10. **`quiz_attempt.total_score`** is a deliberate snapshot written once at the end of
    the session (it equals `SUM(user_answer.points_earned)`), so results and history lists
    can be read without aggregation.
11. **How each question type is stored:**

    | Type | Definition (correct answer) | Participant answer | Evaluation |
    |---|---|---|---|
    | MULTIPLE_CHOICE | 2..10 `answer_option` rows, exactly one `is_correct` | `user_answer.selected_option_id` | selected option is the correct one |
    | TRUE_FALSE | 2 `answer_option` rows ("TRUE", "FALSE"), one `is_correct` | `user_answer.selected_option_id` | same as above |
    | OPEN_ANSWER | `question.correct_text_answer` (lowercase) | `user_answer.text_answer` | `LOWER(text_answer) = correct_text_answer` |
    | FILL_IN_THE_BLANK | blank marker in `question_text` + `question.correct_text_answer` | `user_answer.text_answer` | text comparison, as above |
    | MATCHING | ≥2 `matching_pair` rows (left_item ↔ right_item) | one `user_answer` + one `user_answer_match` row per left item | every `left_pair_id = selected_right_pair_id` |

    In all cases the result is stored in `user_answer.is_correct` and `points_earned`.
12. **Simplicity.** No visibility field, password, join request, chat, leaderboard, speed
    bonus, pause or reconnection data, because none of these features exist.
"""

DOC_CONSTRAINTS = """## 4. Business constraints and where they are enforced

| Rule | Requirement | Enforced by |
|---|---|---|
| Unique email / username | — | DB: `UNIQUE` |
| Email immutable | cannot change | App (reject updates) |
| Passwords | hash only | App (bcrypt/argon2) → `password_hash` |
| Rooms per user | ≤ 10 | App: count `room` by `owner_user_id` in a transaction |
| Quizzes per user | ≤ 15 | App: count `quiz` by `creator_user_id` in a transaction |
| Members per room | ≤ 40 incl. owner | App: `SELECT … FOR UPDATE` on room, count memberships, insert |
| Room owners | exactly 1 | DB: `room.owner_user_id NOT NULL`; ≤1 OWNER membership via `owner_flag` UNIQUE; App keeps both in sync |
| Questions per quiz | ≤ 25 | DB: `display_order` 1..25 + UNIQUE(quiz_id, display_order) |
| Options per MC question | ≤ 10 | DB: `display_order` 1..10 + UNIQUE(question_id, display_order) |
| Correct option | exactly 1 | DB: ≤1 (`correct_flag` UNIQUE); App: ≥1 before publishing |
| TRUE_FALSE | exactly 2 options | App |
| Text answer | exactly 1 for OPEN_ANSWER / FILL_IN_THE_BLANK | DB: CHECK `chk_question_text_answer` |
| MATCHING | ≥ 2 pairs, unique left and right items | DB: UNIQUE per side; App: ≥2 |
| Active sessions per room | ≤ 1 | DB: `active_flag` + UNIQUE(room_id, active_flag) |
| Start session | OWNER/ADMIN only | App |
| Join session | only while `WAITING`; no rejoin after disconnect | App |
| Quiz owner | exactly 1, not transferable | DB: `creator_user_id NOT NULL`; App: never update it |
| Room admin ≠ collaborator | no implicit rights | App (permissions read only from `quiz_collaborator`) |
| Quiz deletion / collaborator management | creator only | App |
| Quiz content editing | creator + collaborators | App |
| Quiz last update date | reflects content edits | DB for the quiz row (`ON UPDATE`); App refreshes it when questions/options/pairs/media change |
| Remove members, add/remove room quizzes | OWNER/ADMIN only | App |
| Leave room / rejoin | delete own membership; rejoin with a valid link | DB: membership row deleted, PK allows re-insert; App checks link |
| Child rows match question type | options only for MULTIPLE_CHOICE/TRUE_FALSE, pairs only for MATCHING | App |
| Answer columns match question type | option / text / match rows | App |
| One answer per question per participant | — | DB: UNIQUE(attempt_id, question_id) |
| One participation per user per session | simultaneous sessions in different rooms allowed | DB: UNIQUE(session_id, user_id) |
| Participant / host is a room member | at session time | App (not an FK: memberships are deleted on leave, history must survive) |
| Invitation validity | not expired | App (`expires_at > NOW()`); DB CHECK `expires_at > created_at` |
| Saved word | once per user | DB: UNIQUE(user_id, translation_id) |
| Translation direction | EN↔KO only, distinct languages | DB: ENUM + CHECK |
| Video quality | ≤ 720p | App / upload pipeline (DB stores URL only) |
| Answer evaluation | lowercase exact comparison | App (`correct_text_answer` stored lowercase) |
"""

DOC_OPEN = """## 6. Unresolved design decisions (open questions)

These are documented, not silently decided. The model supports either answer
unless noted.

1. **Automatic vs. manual saving of looked-up words.** The spec treats history and
   vocabulary as one list but does not say whether every lookup is saved. *Model impact:*
   none. With automatic saving every lookup upserts `saved_word` (updating
   `last_looked_up_at`); with manual saving rows are created only on "Save". The cache
   is filled either way.
2. **Contextual explanation caching.** The explanation is cached per word and direction. If it
   should depend on the surrounding sentence, or be written in the user's interface
   language, the cache key must be extended (e.g. an `explanation_language` column) or
   the explanation moved out of the cache.
3. **Quizzes created from a room** (`is_in_library = FALSE`): Do they count toward the
   15-quiz limit? If the quiz is removed from every room, should it be deleted, or moved into
   the library? Can the creator later add it to their library?
4. **Who can create invitation links:** only OWNER/ADMIN (assumed in the app rules) or any
   member? Are links single-use or multi-use until expiry? Is there a default expiry
   time? (Single-use would need a `used_at` column.)
5. **Targeted vs. open invitations.** The model allows both (`invited_user_id` nullable).
   Confirm whether invitations are always sent to a specific registered user.
6. **Room owner deletes their account.** Currently the room is deleted (cascade). The
   alternative, transferring ownership to an admin, is not in the spec.
7. **Editing a quiz after it has been played.** History keeps `is_correct` and
   `points_earned`, but option text and pairs are live references. If deleting or editing
   played questions must not alter history, either block editing of played quizzes or
   snapshot the question data.
8. **Adding DRAFT quizzes to rooms.** Can a DRAFT quiz be added to a room, or only a
   PUBLISHED one? Sessions are assumed to require PUBLISHED.
9. **Cancelled sessions.** Kept with status `CANCELLED` (current model) or deleted?
10. **Unanswered questions** (time-out): store a `user_answer` row with no answer and 0
    points, or no row at all?
11. **MATCHING scoring:** all-or-nothing, or partial points per correct pair? Maximum
    number of pairs?
12. **Media per question:** any number, or at most one image/audio/video? (The model allows
    any number.)
13. **Collaborator invitations:** added directly by the owner (current model), or a
    pending invitation the collaborator must accept?
14. **Default values:** `translation_target_language` defaults to KOREAN; question
    `point_value` 100 and `time_limit_seconds` 30; `learning_language` is nullable because
    it is not asked for at registration. Confirm these defaults and ranges.
15. **Predefined topic names:** must they be unique across custom topics too?
16. **Room administrators:** who can promote a member to ADMIN or demote them: only the
    owner, or admins too? The model only stores the role.
"""


def build_doc():
    out = [DOC_INTRO]
    out.append("## 1. Tables\n")
    out.append(f"{len(TABLES)} tables in 6 groups.\n")
    group_names = [G_USER, G_ROOM, G_QUIZ, G_QA, G_GAME, G_VOCAB]
    n = 1
    for g in group_names:
        out.append(f"### {g}\n")
        for t in [t for t in TABLES if t.group == g]:
            out.append(f"#### {n}. `{t.name}`\n")
            out.append(t.doc + "\n")
            out.append("| Column | Type | Key | Null | Default / notes |")
            out.append("|---|---|---|---|---|")
            for c in t.cols:
                key = []
                if c.pk:
                    key.append("PK")
                if c.fk:
                    key.append(f"FK → {c.fk.table}.{c.fk.column}")
                if c.unique:
                    key.append("UQ")
                notes = []
                if c.auto:
                    notes.append("AUTO_INCREMENT")
                if c.default is not None:
                    notes.append(f"DEFAULT {c.default}")
                if c.on_update_now:
                    notes.append("ON UPDATE CURRENT_TIMESTAMP")
                if c.generated:
                    notes.append(f"STORED GENERATED: `{c.generated}`")
                if c.fk:
                    notes.append(f"ON DELETE {c.fk.on_delete}")
                if c.doc and not c.auto:
                    notes.append(c.doc)
                out.append(f"| `{c.name}` | {c.sql_type()} | {', '.join(key)} "
                           f"| {'YES' if c.nullable else 'NO'} "
                           f"| {'; '.join(notes).replace('|', '/')} |")
            extra = []
            for name, cs in t.uniques:
                extra.append(f"* UNIQUE `{name}` ({', '.join(cs)})")
            for name, expr in t.checks:
                extra.append(f"* CHECK `{name}`: `{expr}`")
            for r in t.app_rules:
                extra.append(f"* App rule: {r}")
            if extra:
                out.append("")
                out += extra
            out.append("")
            n += 1

    out.append("## 2. Relationships\n")
    out.append("Read as *parent (cardinality) — relationship — child "
               "(cardinality)*. Every relationship is one FK.\n")
    out.append("| # | Parent | Card. | Relationship | Child | Card. | FK column | "
               "Type | ON DELETE |")
    out.append("|---|---|---|---|---|---|---|---|---|")
    i = 1
    for t in TABLES:
        for c in t.cols:
            if not c.fk:
                continue
            pc = c.fk.parent_card or ("0..1" if c.nullable else "1")
            kind = "1:1" if c.fk.child_card in ("1", "0..1") else "1:N"
            out.append(f"| {i} | `{c.fk.table}` | {pc} | {c.fk.rel_name} | "
                       f"`{t.name}` | {c.fk.child_card} | `{c.name}` | {kind}"
                       f"{' (identifying)' if c.pk else ''} | {c.fk.on_delete} |")
            i += 1
    out.append("")
    out.append("**Many-to-many relationships** (resolved by junction tables):\n")
    out.append("| N:M | Junction table |")
    out.append("|---|---|")
    out.append("| user ↔ room (membership with role) | `room_membership` |")
    out.append("| room ↔ topic | `room_topic` |")
    out.append("| quiz ↔ user (collaborators) | `quiz_collaborator` |")
    out.append("| room ↔ quiz | `room_quiz` |")
    out.append("| user ↔ quiz_session (participants) | `quiz_attempt` |")
    out.append("| user ↔ translation_cache (vocabulary) | `saved_word` |")
    out.append("")
    out.append(DOC_DECISIONS)
    out.append(DOC_CONSTRAINTS)
    out.append("## 5. Normalization check\n")
    out.append(
        "* **1NF:** every column is atomic. There are no lists in columns: options, pairs, "
        "media, topics, members and answers are separate rows.\n"
        "* **2NF:** every junction table with a composite key (`room_membership`, "
        "`room_topic`, `quiz_collaborator`, `room_quiz`, `user_answer_match`) has "
        "non-key columns that depend on the whole key.\n"
        "* **3NF:** no non-key column depends on another non-key column. Translation data "
        "lives only in `translation_cache`, not in `saved_word`; user data lives only in "
        "`user`.\n"
        "* **Deliberate, controlled redundancy:** `quiz_attempt.total_score` and "
        "`user_answer.is_correct` / `points_earned` (result snapshots taken at "
        "evaluation time), the OWNER membership row mirroring `room.owner_user_id`, and the stored "
        "generated helper columns (`owner_flag`, `correct_flag`, `active_flag`), which "
        "MySQL computes itself, so they cannot become inconsistent.\n"
        "* Every FK references a primary key, and every N:M relationship uses a "
        "junction table.\n")
    out.append(DOC_OPEN)
    return "\n".join(out)


def main():
    with open(os.path.join(OUT_DIR, "RUSH_Database_Design.md"), "w",
              encoding="utf-8", newline="\n") as f:
        f.write(build_doc())
    sql = build_sql()
    with open(os.path.join(OUT_DIR, "rush_schema.sql"), "w",
              encoding="utf-8", newline="\n") as f:
        f.write(sql + "\n")
    mdj = build_mdj()
    with open(os.path.join(OUT_DIR, "RUSH_ERD.mdj"), "w",
              encoding="utf-8") as f:
        json.dump(mdj, f, indent=1, ensure_ascii=False)
    n_rel = sum(1 for t in TABLES for c in t.cols if c.fk)
    print(f"tables={len(TABLES)} relationships={n_rel}")


if __name__ == "__main__":
    main()


"""
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Script que contiene la definición única del modelo relacional y genera a partir de ella
el esquema SQL, el diagrama de StarUML y el documento de diseño de la base de datos.

Responsabilidades principales:
- Definir las 20 tablas con un pequeño lenguaje propio (clases Col, FK, Table) agrupadas en áreas.
- build_sql: generar las sentencias CREATE TABLE para MySQL 8.0.
- build_mdj: generar el proyecto de StarUML con entidades, columnas y relaciones.
- build_doc: generar el documento RUSH_Database_Design.md.

Elementos importantes:
- class Col
- class FK
- class Table
- TABLES
- build_sql()
- build_mdj()
- build_doc()
- main()

Dependencias:
- json, os, secrets, base64 (biblioteca estándar)

Flujo de datos:
Entrada: las definiciones del propio script. Salida: rush_schema.sql, RUSH_ERD.mdj y
RUSH_Database_Design.md.

Aspectos técnicos importantes:
- main() escribe en OUT_DIR, que es la raíz del proyecto, no en database/ ni en docs/: tras
  regenerar hay que mover los archivos a sus carpetas.
- La aplicación no lo ejecuta: es una herramienta de diseño.

Lugar en la arquitectura:
Herramienta de diseño de la base de datos (fuera de la aplicación). Explica de dónde salen el
esquema y el diagrama entidad-relación.
"""
