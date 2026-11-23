/**
 * Kysely table types. They mirror database/rush_schema.sql exactly (the schema is the source of truth).
 * - Generated<T>: column has a DB default / AUTO_INCREMENT (optional on insert).
 * - StoredGenerated: STORED GENERATED helper columns — read-only, never written by the app.
 */
import type { ColumnType, Generated, Selectable } from 'kysely';
import type { Language, MediaType, MembershipRole, QuestionType, SessionStatus } from '@rush/shared';

type StoredGenerated = ColumnType<number | null, never, never>;
type CreatedAt = ColumnType<Date, Date | undefined, never>;
type UpdatedAt = ColumnType<Date, Date | undefined, Date | undefined>;

export interface UserTable {
  user_id: Generated<number>;
  full_name: string;
  username: string;
  email: ColumnType<string, string, never>; // immutable after registration
  password_hash: string;
  profile_picture_url: string | null;
  description: string | null;
  learning_language: Language | null;
  account_role: Generated<'USER' | 'SUPERADMIN'>;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
  security_question_id: number | null;
  security_answer_hash: string | null;
  recovery_failed_attempts: Generated<number>; // DB default 0
  recovery_locked_until: Date | null;
}


export interface UserPreferencesTable {
  user_id: number;
  interface_language: Generated<Language>;
  translation_target_language: Generated<Language>;
  updated_at: UpdatedAt;
}

export interface RoomTable {
  room_id: Generated<number>;
  owner_user_id: ColumnType<number, number, never>;
  name: string;
  description: string;
  cover_image_url: string;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface RoomMembershipTable {
  room_id: number;
  user_id: number;
  membership_role: Generated<MembershipRole>;
  joined_at: CreatedAt;
  owner_flag: StoredGenerated;
}

export interface RoomInvitationTable {
  invitation_id: Generated<number>;
  room_id: number;
  created_by_user_id: number;
  invited_user_id: number | null;
  token_hash: string;
  expires_at: Date;
  created_at: CreatedAt;
}

export interface TopicTable {
  topic_id: Generated<number>;
  name: string;
  topic_type: 'PREDEFINED' | 'CUSTOM';
  created_by_user_id: number | null;
  created_at: CreatedAt;
}

export interface RoomTopicTable {
  room_id: number;
  topic_id: number;
}

export interface QuizTable {
  quiz_id: Generated<number>;
  creator_user_id: ColumnType<number, number, never>; // permanent owner
  title: string;
  description: string;
  quiz_status: Generated<'DRAFT' | 'PUBLISHED'>;
  is_in_library: Generated<boolean>;
  total_time_limit_seconds: Generated<number>;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface QuizCollaboratorTable {
  quiz_id: number;
  user_id: number;
  added_at: CreatedAt;
}

export interface RoomQuizTable {
  room_id: number;
  quiz_id: number;
  added_at: CreatedAt;
}

export interface QuestionTable {
  question_id: Generated<number>;
  quiz_id: number;
  question_text: string;
  question_type: QuestionType;
  point_value: Generated<number>;
  time_limit_seconds: Generated<number>; // legacy, unused
  display_order: number;
  correct_text_answer: string | null;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface AnswerOptionTable {
  option_id: Generated<number>;
  question_id: number;
  option_text: string;
  is_correct: Generated<boolean>;
  display_order: number;
  correct_flag: StoredGenerated;
}

export interface MatchingPairTable {
  pair_id: Generated<number>;
  question_id: number;
  left_item: string;
  right_item: string;
  display_order: number;
}

export interface QuestionMediaTable {
  media_id: Generated<number>;
  question_id: number;
  media_type: MediaType;
  media_url: string;
  created_at: CreatedAt;
}

export interface QuizSessionTable {
  session_id: Generated<number>;
  room_id: number;
  quiz_id: number;
  host_user_id: number | null;
  session_status: Generated<SessionStatus>;
  created_at: CreatedAt;
  started_at: Date | null;
  ended_at: Date | null;
  winner_user_id: number | null;
  active_flag: StoredGenerated;
}

export interface QuizAttemptTable {
  attempt_id: Generated<number>;
  session_id: number;
  user_id: number;
  total_score: Generated<number>;
  joined_at: CreatedAt;
  disconnected_at: Date | null;
  finished_at: Date | null;
}

export interface UserAnswerTable {
  user_answer_id: Generated<number>;
  attempt_id: number;
  question_id: number;
  selected_option_id: number | null;
  text_answer: string | null;
  is_correct: Generated<boolean>;
  points_earned: Generated<number>;
  answered_at: CreatedAt;
}

export interface UserAnswerMatchTable {
  user_answer_id: number;
  left_pair_id: number;
  selected_right_pair_id: number;
}

export interface TranslationCacheTable {
  translation_id: Generated<number>;
  source_word: string;
  source_language: Language;
  target_language: Language;
  translated_word: string;
  contextual_explanation: string | null;
  created_at: CreatedAt;
}

export interface SavedWordTable {
  saved_word_id: Generated<number>;
  user_id: number;
  translation_id: number;
  personal_note: string | null;
  is_favorite: Generated<boolean>;
  saved_at: CreatedAt;
  last_looked_up_at: Generated<Date>;
}

export interface DB {
  user: UserTable;
  user_preferences: UserPreferencesTable;
  room: RoomTable;
  room_membership: RoomMembershipTable;
  room_invitation: RoomInvitationTable;
  topic: TopicTable;
  room_topic: RoomTopicTable;
  quiz: QuizTable;
  quiz_collaborator: QuizCollaboratorTable;
  room_quiz: RoomQuizTable;
  question: QuestionTable;
  answer_option: AnswerOptionTable;
  matching_pair: MatchingPairTable;
  question_media: QuestionMediaTable;
  quiz_session: QuizSessionTable;
  quiz_attempt: QuizAttemptTable;
  user_answer: UserAnswerTable;
  user_answer_match: UserAnswerMatchTable;
  translation_cache: TranslationCacheTable;
  saved_word: SavedWordTable;
}

export type UserRow = Selectable<UserTable>;

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Describe en TypeScript cada tabla de la base de datos para que Kysely compruebe en tiempo
de compilación los nombres de columnas y sus tipos.

Responsabilidades principales:
- Declarar una interfaz por tabla (UserTable, RoomTable, QuizTable, QuestionTable, etc.) con las
  mismas columnas que database/rush_schema.sql.
- Marcar las columnas con valor por defecto o AUTO_INCREMENT como Generated (opcionales al
  insertar).
- Marcar las columnas generadas por MySQL (owner_flag, correct_flag, active_flag) como de solo
  lectura.
- Impedir en el tipo que se actualicen columnas inmutables, como user.email o quiz.creator_user_id.

Elementos importantes:
- Interfaz DB: mapa nombre de tabla → interfaz de la tabla (20 tablas).
- UserRow: tipo de una fila de usuario seleccionada.
- StoredGenerated, CreatedAt, UpdatedAt: tipos auxiliares.

Dependencias:
- kysely (ColumnType, Generated, Selectable)
- @rush/shared (tipos Language, QuestionType, MembershipRole, SessionStatus, MediaType)

Flujo de datos:
No ejecuta código en tiempo de ejecución: solo aporta tipos. Lo usan db/index.ts y todos los
servicios.

Aspectos técnicos importantes:
- No es un ORM: no crea tablas ni migraciones. Si el esquema SQL cambia, este archivo debe
  actualizarse a mano para que coincida.

Lugar en la arquitectura:
Puente de tipos entre el esquema físico (MySQL) y el código del backend. Gracias a estos tipos, un
error en el nombre de una columna se detecta al compilar y no en producción.
*/
