#!/usr/bin/env bash
# Behavioural tests for rush_schema.sql against the rush-mysql-test container.
# Usage: docker run -d --name rush-mysql-test -e MYSQL_ROOT_PASSWORD=rushtest mysql:8.0
#        docker exec -i rush-mysql-test mysql -prushtest < rush_schema.sql
#        bash generator/test_schema.sh
PASS=0; FAIL=0
m() { docker exec -i rush-mysql-test mysql -prushtest -N rush -e "$1" 2>&1 | grep -v "Using a password"; }
ok()   { out=$(m "$2"); if echo "$out" | grep -q "^ERROR"; then echo "FAIL (expected success) $1: $out"; FAIL=$((FAIL+1)); else echo "ok   $1"; PASS=$((PASS+1)); fi; }
bad()  { out=$(m "$2"); if echo "$out" | grep -q "^ERROR"; then echo "ok   $1 -> rejected: ${out:0:90}"; PASS=$((PASS+1)); else echo "FAIL (expected rejection) $1"; FAIL=$((FAIL+1)); fi; }
eq()   { out=$(m "$2"); if [ "$out" = "$3" ]; then echo "ok   $1 = $3"; PASS=$((PASS+1)); else echo "FAIL $1: got '$out' expected '$3'"; FAIL=$((FAIL+1)); fi; }

echo "== users =="
ok  "insert users" "INSERT INTO user (user_id,full_name,username,email,password_hash) VALUES
 (1,'Ana Kim','ana','ana@x.test','h'),(2,'Ben Lee','ben','ben@x.test','h'),(3,'Cho Park','cho','cho@x.test','h'),(4,'Root','root','root@x.test','h');
 UPDATE user SET account_role='SUPERADMIN' WHERE user_id=4;
 INSERT INTO user_preferences (user_id) VALUES (1),(2),(3),(4);"
eq  "default role" "SELECT account_role FROM user WHERE user_id=1" "USER"
eq  "default prefs" "SELECT CONCAT(interface_language,'/',translation_target_language) FROM user_preferences WHERE user_id=1" "ENGLISH/KOREAN"
bad "duplicate email" "INSERT INTO user (full_name,username,email,password_hash) VALUES ('X','x1','ana@x.test','h')"
bad "duplicate username" "INSERT INTO user (full_name,username,email,password_hash) VALUES ('X','ana','x@x.test','h')"
bad "invalid language enum" "UPDATE user_preferences SET interface_language='SPANISH' WHERE user_id=1"
bad "second preferences row" "INSERT INTO user_preferences (user_id) VALUES (1)"

echo "== rooms =="
ok  "room + owner membership" "INSERT INTO room (room_id,owner_user_id,name,description,cover_image_url) VALUES (1,1,'Korean 101','d','https://cdn/x.png');
 INSERT INTO room_membership (room_id,user_id,membership_role) VALUES (1,1,'OWNER'),(1,2,'ADMIN'),(1,3,'MEMBER');"
bad "second OWNER in same room" "UPDATE room_membership SET membership_role='OWNER' WHERE room_id=1 AND user_id=2"
bad "duplicate membership" "INSERT INTO room_membership (room_id,user_id) VALUES (1,3)"
ok  "invitation" "INSERT INTO room_invitation (room_id,created_by_user_id,invited_user_id,token_hash,expires_at) VALUES (1,1,3,REPEAT('a',64),NOW()+INTERVAL 7 DAY)"
bad "invitation already expired at creation" "INSERT INTO room_invitation (room_id,created_by_user_id,token_hash,expires_at,created_at) VALUES (1,1,REPEAT('b',64),'2026-01-01','2026-02-01')"
bad "duplicate token" "INSERT INTO room_invitation (room_id,created_by_user_id,token_hash,expires_at) VALUES (1,1,REPEAT('a',64),NOW()+INTERVAL 1 DAY)"
ok  "topics" "INSERT INTO topic (topic_id,name,topic_type,created_by_user_id) VALUES (1,'Grammar','PREDEFINED',NULL),(2,'K-drama','CUSTOM',2);
 INSERT INTO room_topic VALUES (1,1),(1,2);"
ok  "member leaves and rejoins via invitation" "DELETE FROM room_membership WHERE room_id=1 AND user_id=3;
 INSERT INTO room_membership (room_id,user_id) VALUES (1,3)"
bad "same custom topic name twice for a user" "INSERT INTO topic (name,topic_type,created_by_user_id) VALUES ('K-drama','CUSTOM',2)"

echo "== quizzes and questions =="
ok  "quiz, collaborator, room_quiz" "INSERT INTO quiz (quiz_id,creator_user_id,title,description) VALUES (1,1,'Basics',''),(2,2,'Room quiz','');
 UPDATE quiz SET is_in_library=FALSE WHERE quiz_id=2;
 INSERT INTO quiz_collaborator (quiz_id,user_id) VALUES (1,3);
 INSERT INTO room_quiz (room_id,quiz_id) VALUES (1,1),(1,2);"
eq  "default quiz status" "SELECT quiz_status FROM quiz WHERE quiz_id=1" "DRAFT"
ok  "MC question + options" "INSERT INTO question (question_id,quiz_id,question_text,question_type,display_order) VALUES (1,1,'Hello = ?','MULTIPLE_CHOICE',1);
 INSERT INTO answer_option (option_id,question_id,option_text,is_correct,display_order) VALUES (1,1,'annyeong',TRUE,1),(2,1,'gamsa',FALSE,2)"
bad "second correct option" "INSERT INTO answer_option (question_id,option_text,is_correct,display_order) VALUES (1,'ne',TRUE,3)"
bad "11th option (display_order 11)" "INSERT INTO answer_option (question_id,option_text,display_order) VALUES (1,'z',11)"
bad "26th question (display_order 26)" "INSERT INTO question (quiz_id,question_text,question_type,display_order) VALUES (1,'q','TRUE_FALSE',26)"
bad "duplicate question order" "INSERT INTO question (quiz_id,question_text,question_type,display_order) VALUES (1,'q','TRUE_FALSE',1)"
bad "zero points" "INSERT INTO question (quiz_id,question_text,question_type,display_order,point_value) VALUES (1,'q','TRUE_FALSE',5,0)"
bad "OPEN_ANSWER without answer" "INSERT INTO question (quiz_id,question_text,question_type,display_order) VALUES (1,'q','OPEN_ANSWER',5)"
bad "MC with text answer" "INSERT INTO question (quiz_id,question_text,question_type,display_order,correct_text_answer) VALUES (1,'q','MULTIPLE_CHOICE',5,'x')"
ok  "OPEN_ANSWER, MATCHING, media" "INSERT INTO question (question_id,quiz_id,question_text,question_type,display_order,correct_text_answer) VALUES (2,1,'Thank you = ?','OPEN_ANSWER',2,'gamsahamnida');
 INSERT INTO question (question_id,quiz_id,question_text,question_type,display_order) VALUES (3,1,'Match','MATCHING',3);
 INSERT INTO matching_pair (pair_id,question_id,left_item,right_item,display_order) VALUES (1,3,'cat','goyangi',1),(2,3,'dog','gae',2);
 INSERT INTO question_media (question_id,media_type,media_url) VALUES (1,'IMAGE','https://cdn/q1.png')"
ok  "TRUE_FALSE and FILL_IN_THE_BLANK" "INSERT INTO question (question_id,quiz_id,question_text,question_type,display_order) VALUES (4,1,'Seoul is in Korea','TRUE_FALSE',4);
 INSERT INTO answer_option (question_id,option_text,is_correct,display_order) VALUES (4,'TRUE',TRUE,1),(4,'FALSE',FALSE,2);
 INSERT INTO question (question_id,quiz_id,question_text,question_type,display_order,correct_text_answer) VALUES (5,1,'I ___ a student','FILL_IN_THE_BLANK',5,'am')"
eq  "all five question types stored" "SELECT COUNT(DISTINCT question_type) FROM question WHERE quiz_id=1" "5"
bad "TRUE_FALSE with two correct options" "UPDATE answer_option SET is_correct=TRUE WHERE question_id=4"
bad "duplicate left item in matching" "INSERT INTO matching_pair (question_id,left_item,right_item,display_order) VALUES (3,'cat','x',3)"

echo "== sessions =="
ok  "session WAITING" "INSERT INTO quiz_session (session_id,room_id,quiz_id,host_user_id) VALUES (1,1,1,2)"
bad "second active session in room" "INSERT INTO quiz_session (room_id,quiz_id,host_user_id,session_status) VALUES (1,2,1,'IN_PROGRESS')"
ok  "attempts and answers" "INSERT INTO quiz_attempt (attempt_id,session_id,user_id) VALUES (1,1,1),(2,1,3);
 UPDATE quiz_session SET session_status='IN_PROGRESS', started_at=NOW() WHERE session_id=1;
 INSERT INTO user_answer (user_answer_id,attempt_id,question_id,selected_option_id,is_correct,points_earned) VALUES (1,1,1,1,TRUE,100);
 INSERT INTO user_answer (user_answer_id,attempt_id,question_id,text_answer,is_correct,points_earned) VALUES (2,1,2,'gamsahamnida',TRUE,100);
 INSERT INTO user_answer (user_answer_id,attempt_id,question_id,is_correct) VALUES (3,1,3,FALSE);
 INSERT INTO user_answer_match VALUES (3,1,2),(3,2,1);"
ok  "same user in a simultaneous session in another room" "INSERT INTO room (room_id,owner_user_id,name,description,cover_image_url) VALUES (2,3,'Room B','d','https://cdn/b.png');
 INSERT INTO quiz_session (session_id,room_id,quiz_id,host_user_id,session_status) VALUES (10,2,1,3,'IN_PROGRESS');
 INSERT INTO quiz_attempt (session_id,user_id) VALUES (10,1)"
bad "same user twice in a session" "INSERT INTO quiz_attempt (session_id,user_id) VALUES (1,1)"
bad "two answers to same question" "INSERT INTO user_answer (attempt_id,question_id) VALUES (1,1)"
bad "ended before started" "UPDATE quiz_session SET ended_at = started_at - INTERVAL 1 HOUR WHERE session_id=1"
ok  "complete session, start a new one" "UPDATE quiz_session SET session_status='COMPLETED', ended_at=NOW() WHERE session_id=1;
 INSERT INTO quiz_session (session_id,room_id,quiz_id,host_user_id) VALUES (2,1,1,1);
 UPDATE quiz_session SET session_status='CANCELLED' WHERE session_id=2"
ok  "same quiz played again in same room" "INSERT INTO quiz_session (session_id,room_id,quiz_id,host_user_id) VALUES (3,1,1,2)"

echo "== vocabulary =="
ok  "cache + saved word" "INSERT INTO translation_cache (translation_id,source_word,source_language,target_language,translated_word) VALUES (1,'apple','ENGLISH','KOREAN','sagwa');
 INSERT INTO saved_word (user_id,translation_id) VALUES (1,1),(2,1)"
bad "duplicate cache entry" "INSERT INTO translation_cache (source_word,source_language,target_language,translated_word) VALUES ('apple','ENGLISH','KOREAN','x')"
ok  "different case is a different key (binary collation)" "INSERT INTO translation_cache (translation_id,source_word,source_language,target_language,translated_word) VALUES (2,'Apple','ENGLISH','KOREAN','sagwa')"
bad "same-language translation" "INSERT INTO translation_cache (source_word,source_language,target_language,translated_word) VALUES ('pear','ENGLISH','ENGLISH','x')"
bad "same word saved twice by a user" "INSERT INTO saved_word (user_id,translation_id) VALUES (1,1)"
bad "delete cache row in use (RESTRICT)" "DELETE FROM translation_cache WHERE translation_id=1"

echo "== deletion rules =="
ok  "remove quiz 2 from room only" "DELETE FROM room_quiz WHERE room_id=1 AND quiz_id=2"
eq  "quiz 2 still exists" "SELECT COUNT(*) FROM quiz WHERE quiz_id=2" "1"
ok  "delete option referenced by an answer" "DELETE FROM answer_option WHERE option_id=1"
eq  "answer kept, option nulled" "SELECT CONCAT(IFNULL(selected_option_id,'NULL'),'/',points_earned) FROM user_answer WHERE user_answer_id=1" "NULL/100"
ok  "host (user 2) deletes account" "DELETE FROM user WHERE user_id=2"
eq  "session 1 kept, host NULL" "SELECT IFNULL(host_user_id,'NULL') FROM quiz_session WHERE session_id=1" "NULL"
eq  "user 2's custom topic gone" "SELECT COUNT(*) FROM topic WHERE topic_id=2" "0"
eq  "user 2's saved words gone" "SELECT COUNT(*) FROM saved_word WHERE user_id=2" "0"
eq  "user 2's quiz gone" "SELECT COUNT(*) FROM quiz WHERE quiz_id=2" "0"
ok  "collaborator (user 5) deletes account" "INSERT INTO user (user_id,full_name,username,email,password_hash) VALUES (5,'Eun','eun','eun@x.test','h');
 INSERT INTO quiz_collaborator (quiz_id,user_id) VALUES (1,5);
 DELETE FROM user WHERE user_id=5"
eq  "quiz kept, only collaborator link gone" "SELECT CONCAT((SELECT COUNT(*) FROM quiz WHERE quiz_id=1),'/',(SELECT COUNT(*) FROM quiz_collaborator WHERE user_id=5),'/',(SELECT COUNT(*) FROM quiz_collaborator WHERE user_id=3))" "1/0/1"
ok  "delete quiz 1" "DELETE FROM quiz WHERE quiz_id=1"
eq  "questions/options/pairs/media/room_quiz/sessions/answers gone" "SELECT (SELECT COUNT(*) FROM question)+(SELECT COUNT(*) FROM answer_option)+(SELECT COUNT(*) FROM matching_pair)+(SELECT COUNT(*) FROM question_media)+(SELECT COUNT(*) FROM room_quiz)+(SELECT COUNT(*) FROM quiz_session)+(SELECT COUNT(*) FROM user_answer)+(SELECT COUNT(*) FROM user_answer_match)" "0"
ok  "re-add a quiz to the room, then delete the room" "INSERT INTO quiz (quiz_id,creator_user_id,title,description) VALUES (5,3,'Keep me','');
 INSERT INTO room_quiz (room_id,quiz_id) VALUES (1,5);
 DELETE FROM room WHERE room_id=1"
eq  "room children gone" "SELECT (SELECT COUNT(*) FROM room_membership)+(SELECT COUNT(*) FROM room_invitation)+(SELECT COUNT(*) FROM room_topic)+(SELECT COUNT(*) FROM room_quiz)" "0"
eq  "quiz survives room deletion" "SELECT COUNT(*) FROM quiz WHERE quiz_id=5" "1"
eq  "predefined topic survives" "SELECT COUNT(*) FROM topic WHERE topic_id=1" "1"
ok  "delete user 1 (has saved words, attempts)" "DELETE FROM user WHERE user_id=1"
eq  "user 1 data gone" "SELECT (SELECT COUNT(*) FROM user_preferences WHERE user_id=1)+(SELECT COUNT(*) FROM saved_word WHERE user_id=1)+(SELECT COUNT(*) FROM quiz_attempt WHERE user_id=1)" "0"

echo "== summary: $PASS passed, $FAIL failed =="

# =========================================================
# EXPLICACIÓN DEL ARCHIVO
# =========================================================
#
# Propósito: Pruebas de comportamiento del esquema SQL ejecutadas directamente contra MySQL en un
# contenedor Docker de prueba.
#
# Responsabilidades principales:
# - Funciones ok, bad y eq para comprobar que una sentencia se acepta, se rechaza o devuelve un valor.
# - 65 comprobaciones de usuarios, salas, cuestionarios, sesiones, vocabulario y reglas de borrado en
#   cascada.
#
# Elementos importantes:
# - m
# - ok
# - bad
# - eq
#
# Dependencias:
# - bash
# - docker
# - contenedor rush-mysql-test (independiente del de desarrollo)
#
# Flujo de datos:
# Ejecuta SQL y compara resultados; imprime el resumen de pruebas superadas y fallidas.
#
# Aspectos técnicos importantes:
# - Requiere crear antes el contenedor rush-mysql-test según las instrucciones de su cabecera.
#
# Lugar en la arquitectura:
# Pruebas del modelo de datos. Demuestra que las restricciones de la base de datos funcionan sin la
# aplicación.
