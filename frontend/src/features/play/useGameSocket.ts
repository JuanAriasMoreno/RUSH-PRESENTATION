import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { AnswerSubmission, GameEndDto, LiveQuestionDto, LobbyStateDto, QuestionEndDto, TimerSyncDto } from '@rush/shared';
import { LIMITS } from '@rush/shared';

export type GamePhase =
  | { kind: 'connecting'; reconnecting?: boolean }
  | { kind: 'error'; code: string; message: string }
  | { kind: 'lobby' }
  | { kind: 'question'; question: LiveQuestionDto; submitted: boolean }
  | { kind: 'reveal'; question: LiveQuestionDto; result: QuestionEndDto }
  | { kind: 'completed'; end: GameEndDto }
  | { kind: 'cancelled' }
  | { kind: 'removed' }
  | { kind: 'disconnected' };

/** The ONE global timer of the session, as last reported by the server. */
export interface GlobalTimer {
  endsAt: number; // server clock
  clockOffset: number; // serverNow - Date.now() when it was received
  totalTimeLimitSeconds: number;
}

type Ack<T> = { ok: true; data?: T } | { ok: false; error: { code: string; message: string } };

/** Socket.IO connection for one session. All game state, the timer and the winner come from the server. */
export function useGameSocket(sessionId: number) {
  const [phase, setPhase] = useState<GamePhase>({ kind: 'connecting' });
  const [lobby, setLobby] = useState<LobbyStateDto | null>(null);
  const [canControl, setCanControl] = useState(false);
  const [timer, setTimer] = useState<GlobalTimer | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const finished = useRef(false);

  useEffect(() => {
    finished.current = false;
    let connectedOnce = false;
    let revealUntil = 0;
    let pending: ReturnType<typeof setTimeout> | null = null;
    const socket = io({ withCredentials: true, reconnection: true, reconnectionAttempts: 5, transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    const end = (p: GamePhase) => {
      finished.current = true;
      if (pending) clearTimeout(pending);
      setPhase(p);
    };
    const sync = (t: TimerSyncDto) => setTimer({ endsAt: t.endsAt, clockOffset: t.serverNow - Date.now(), totalTimeLimitSeconds: t.totalTimeLimitSeconds });
    const showQuestion = (q: LiveQuestionDto) => {
      if (finished.current) return;
      setPhase({ kind: 'question', question: q, submitted: false });
    };

    socket.on('connect', () => {
      connectedOnce = true;
      socket.emit('session:join', { sessionId }, (res: Ack<{ lobby: LobbyStateDto; current: LiveQuestionDto | null }>) => {
        if (!res.ok) return end({ kind: 'error', code: res.error.code, message: res.error.message });
        const { lobby: l, current } = res.data!;
        setLobby(l);
        setCanControl(l.canControl);
        if (current) {
          // (re)joined a running game: resume at this player's question with the remaining global time
          sync(current);
          showQuestion(current);
        } else setPhase({ kind: 'lobby' });
      });
    });
    socket.on('connect_error', () => {
      if (!connectedOnce) end({ kind: 'error', code: 'connection_failed', message: 'Connection failed' });
    });
    socket.io.on('reconnect_failed', () => {
      if (!finished.current) end({ kind: 'disconnected' });
    });
    socket.on('session:lobby', (l: LobbyStateDto) => setLobby((prev) => ({ ...l, canControl: prev?.canControl ?? false })));
    socket.on('session:started', (t: TimerSyncDto) => sync(t));
    socket.on('session:timer', (t: TimerSyncDto) => sync(t));
    socket.on('session:question', (q: LiveQuestionDto) => {
      sync(q);
      // let the player see the result of their previous answer for a moment first
      const wait = revealUntil - Date.now();
      if (pending) clearTimeout(pending);
      if (wait > 0) pending = setTimeout(() => showQuestion(q), wait);
      else showQuestion(q);
    });
    socket.on('session:question-end', (r: QuestionEndDto) => {
      revealUntil = Date.now() + LIMITS.answerRevealMs;
      setPhase((p) => (p.kind === 'question' && p.question.questionId === r.questionId ? { kind: 'reveal', question: p.question, result: r } : p));
    });
    socket.on('session:completed', (d: GameEndDto) => end({ kind: 'completed', end: d }));
    socket.on('session:cancelled', () => end({ kind: 'cancelled' }));
    socket.on('session:removed', () => end({ kind: 'removed' }));
    socket.on('disconnect', (reason) => {
      if (finished.current) return;
      // the server closed the connection on purpose (e.g. account deleted): do not retry
      if (reason === 'io server disconnect') return end({ kind: 'disconnected' });
      setPhase({ kind: 'connecting', reconnecting: true });
    });

    return () => {
      finished.current = true;
      if (pending) clearTimeout(pending);
      socket.removeAllListeners();
      socket.io.removeAllListeners();
      socket.disconnect();
    };
  }, [sessionId]);

  const call = <T,>(event: string, payload: object) =>
    new Promise<Ack<T>>((resolve) => {
      const s = socketRef.current;
      if (!s?.connected) return resolve({ ok: false, error: { code: 'not_connected', message: 'Not connected' } });
      s.timeout(10_000).emit(event, payload, (err: Error | null, res: Ack<T>) =>
        resolve(err ? { ok: false, error: { code: 'timeout', message: 'No response from server' } } : res),
      );
    });

  return {
    phase,
    lobby,
    canControl,
    timer,
    start: () => call('session:start', { sessionId }),
    cancel: () => call('session:cancel', { sessionId }),
    answer: (questionId: number, answer: AnswerSubmission) => call<{ accepted: true }>('session:answer', { sessionId, questionId, answer }),
  };
}

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Hook de React que conecta con Socket.IO para una sesión de juego y convierte los eventos
del servidor en el estado de la pantalla.

Responsabilidades principales:
- Conectar con io() (mismo origen, con cookie) y emitir session:join al conectarse; si la partida
  ya está en curso, el servidor devuelve la pregunta actual del jugador (reconexión).
- Guardar el temporizador global (endsAt, diferencia de reloj y tiempo total) recibido en
  session:started, session:question y session:timer.
- Mostrar el resultado propio (session:question-end) durante answerRevealMs antes de pasar a la
  siguiente pregunta (session:question).
- session:completed trae el motivo de fin, el ganador y la clasificación.
- Reintentar la conexión hasta 5 veces si se corta.
- Exponer start, cancel y answer, que emiten eventos con acuse de recibo y tiempo límite de 10 s.

Elementos importantes:
- type GamePhase (connecting, error, lobby, question, reveal, completed, cancelled, removed,
  disconnected)
- interface GlobalTimer
- useGameSocket(sessionId)

Dependencias:
- socket.io-client
- react
- @rush/shared (tipos de eventos)

Flujo de datos:
Recibe del servidor las preguntas y la fecha límite global (endsAt y serverNow) y envía las
respuestas; no calcula puntuaciones ni decide el ganador.

Aspectos técnicos importantes:
- clockOffset = serverNow - Date.now() corrige la diferencia de reloj entre navegador y servidor.
- Si la conexión se corta durante la partida, se reintenta y el servidor reanuda al jugador en su
  pregunta con el mismo tiempo global restante.

Lugar en la arquitectura:
Capa de comunicación en tiempo real del frontend. Es la contraparte en el navegador de
realtime/socket.ts.
*/
