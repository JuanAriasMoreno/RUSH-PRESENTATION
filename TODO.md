# RUSH! — Pending decisions and future work

## Decisions to confirm

The behaviours below are implemented as documented in [`docs/OPEN_QUESTIONS.md`](docs/OPEN_QUESTIONS.md)
and can be changed in application code without a schema change:

- [ ] A-17 — login sessions are stored in memory (a MySQL session store would need a new table).
- [ ] A-18 — the host of a live session also plays.
- [ ] A-22 — the "session starting" email is sent when the host starts the game.

## Verification still needed

- [ ] Run translation and explanations with real Google Cloud Translation and OpenAI keys (the automated tests use the mock provider).
- [ ] Send email through a real SMTP server (the automated tests use the console fallback).
- [ ] Store media in a real S3-compatible bucket (the automated tests use local storage).
- [ ] Accessibility review with a screen reader and testing on physical mobile devices.

## Presentation version

- [ ] If the presentation restrictions must also hold for direct API calls, enforce them in the backend
      (question types, media types, vocabulary export, room cover URL). Today they are applied in the user interface only.
- [ ] Update the landing-page copy if it should describe the presentation version rather than the full application.

## Known limitations

- Login sessions and live-game timers are in memory; a backend restart logs users out and cancels running games (A-17, A-21).
- A running game continues until someone finishes or the global time expires, even if every player disconnects (they can reconnect); the host can cancel it from the room.
- Questions cannot be reordered while a quiz has exactly 25 questions (A-33).
- Deleting a quiz or a room deletes its session history (database design decision 9).
- Open-answer and fill-in-the-blank questions accept exactly one correct answer (`question.correct_text_answer`).
