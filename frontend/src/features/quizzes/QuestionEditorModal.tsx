import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { QuestionDto, QuestionType } from '@rush/shared';
import { LIMITS } from '@rush/shared';
import { mediaApi, quizzesApi } from '../../api/endpoints';
import { Modal } from '../../components/overlays';
import { Button, cx, FormError, TextArea, TextField, inputClass } from '../../components/ui';
import type { TranslationKey } from '../../i18n/en';
import { useI18n } from '../../i18n/I18nProvider';
import { emptyForm, formFromQuestion, toPayload, validateForm, type QuestionFormState } from './questionForm';
import { QUESTION_TYPE_STYLE } from './questionTypes';

/** Presentation version: only these question types can be chosen for questions. */
const PRESENTATION_QUESTION_TYPES: QuestionType[] = ['MULTIPLE_CHOICE', 'TRUE_FALSE'];

export function QuestionEditorModal({
  open,
  onClose,
  quizId,
  question,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  quizId: number;
  question: QuestionDto | null;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState<QuestionFormState>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setForm(question ? formFromQuestion(question) : emptyForm());
    setErrors({});
    setServerError(null);
  }, [open, question]);

  const set = <K extends keyof QuestionFormState>(k: K, v: QuestionFormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const errText = (field: string): string | null => {
    const code = errors[field];
    if (!code) return null;
    const key = `qe.err.${code}` as TranslationKey;
    return t(key) !== key ? t(key) : t('qe.err.generic');
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs = validateForm(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setBusy(true);
    setServerError(null);
    try {
      const payload = toPayload(form);
      if (question) await quizzesApi.updateQuestion(question.questionId, payload);
      else await quizzesApi.addQuestion(quizId, payload);
      onSaved();
      onClose();
    } catch (err) {
      setServerError(err);
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setServerError(null);
    // Presentation version: images only.
    if (!file.type.startsWith('image/')) {
      setServerError(new Error(t('qe.mediaHint')));
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    setUploading(true);
    try {
      const media = await mediaApi.upload(file);
      set('media', media);
    } catch (err) {
      setServerError(err);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const type = form.questionType;
  // An existing question of another type keeps its own type (stored data is preserved, not converted).
  const availableTypes =
    question && !PRESENTATION_QUESTION_TYPES.includes(question.questionType)
      ? [...PRESENTATION_QUESTION_TYPES, question.questionType]
      : PRESENTATION_QUESTION_TYPES;

  return (
    <Modal open={open} onClose={onClose} title={question ? t('qe.editTitle', { n: question.displayOrder }) : t('qe.newTitle')} wide>
      <form className="space-y-5" onSubmit={submit} noValidate>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-fg-soft">{t('qe.type')}</legend>
          <div className={cx('grid grid-cols-2 gap-2', availableTypes.length > 2 && 'sm:grid-cols-3')} role="radiogroup" aria-label={t('qe.type')}>
            {availableTypes.map((qt) => {
              const on = type === qt;
              return (
                <button
                  key={qt}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => set('questionType', qt as QuestionType)}
                  className={cx(
                    'flex flex-col items-center gap-2 rounded-2xl border px-2 py-3 text-center font-display text-xs font-bold transition',
                    on ? cx('border-transparent bg-panel-3 text-fg ring-2', QUESTION_TYPE_STYLE[qt].ring) : 'border-line bg-panel-2 text-muted hover:border-line-strong hover:text-fg',
                  )}
                >
                  <span className={cx('flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br text-[11px] font-black', QUESTION_TYPE_STYLE[qt].chip, QUESTION_TYPE_STYLE[qt].fg, !on && 'opacity-60')} aria-hidden="true">
                    {QUESTION_TYPE_STYLE[qt].glyph}
                  </span>
                  {t(`qe.type.${qt}`)}
                </button>
              );
            })}
          </div>
        </fieldset>
        <TextArea
          label={t('qe.text')}
          value={form.questionText}
          onChange={(e) => set('questionText', e.target.value)}
          maxLength={2000}
          hint={type === 'FILL_IN_THE_BLANK' ? t('qe.textBlankHint') : undefined}
          error={errText('questionText')}
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label={t('qe.points')}
            type="number"
            min={LIMITS.minPoints}
            max={LIMITS.maxPoints}
            value={form.pointValue}
            onChange={(e) => set('pointValue', Number(e.target.value))}
            error={errors.pointValue ? `${LIMITS.minPoints}–${LIMITS.maxPoints}` : null}
            hint={t('qe.timeHint')}
          />
        </div>

        {type === 'MULTIPLE_CHOICE' && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-fg-soft">{t('qe.options')}</legend>
            <p className="text-xs text-muted">{t('qe.optionsHint')}</p>
            {form.options.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <label className="flex shrink-0 items-center gap-1.5 text-sm">
                  <input
                    type="radio"
                    name="correct-option"
                    checked={o.isCorrect}
                    onChange={() => set('options', form.options.map((x, j) => ({ ...x, isCorrect: j === i })))}
                    className="h-4 w-4 accent-magenta"
                  />
                  <span className="sr-only sm:not-sr-only">{t('qe.correct')}</span>
                </label>
                <input
                  aria-label={t('qe.option', { n: i + 1 })}
                  placeholder={t('qe.option', { n: i + 1 })}
                  value={o.text}
                  maxLength={255}
                  onChange={(e) => set('options', form.options.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                  className={cx(inputClass())}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t('common.remove')}
                  disabled={form.options.length <= LIMITS.minOptionsMultipleChoice}
                  onClick={() => set('options', form.options.filter((_, j) => j !== i))}
                >
                  ✕
                </Button>
              </div>
            ))}
            {errText('options') && <p className="text-sm text-danger-soft">{errText('options')}</p>}
            <Button variant="secondary" size="sm" disabled={form.options.length >= LIMITS.maxOptionsPerQuestion} onClick={() => set('options', [...form.options, { text: '', isCorrect: false }])}>
              + {t('qe.addOption')}
            </Button>
          </fieldset>
        )}

        {type === 'TRUE_FALSE' && (
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-fg-soft">{t('qe.correctAnswer')}</legend>
            <div className="flex gap-2">
              {[true, false].map((v) => (
                <button
                  key={String(v)}
                  type="button"
                  aria-pressed={form.trueIsCorrect === v}
                  onClick={() => set('trueIsCorrect', v)}
                  className={cx('flex-1 rounded-xl border-2 px-4 py-3 font-semibold', form.trueIsCorrect === v ? (v ? 'border-lime bg-lime/10 text-lime shadow-glow-lime' : 'border-danger bg-danger/10 text-danger-soft') : 'border-line text-fg-soft hover:border-line-strong')}
                >
                  {v ? t('common.true') : t('common.false')}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {(type === 'OPEN_ANSWER' || type === 'FILL_IN_THE_BLANK') && (
          <TextField
            label={t('qe.correctAnswer')}
            value={form.correctTextAnswer}
            onChange={(e) => set('correctTextAnswer', e.target.value)}
            maxLength={255}
            hint={t('qe.textAnswerHint')}
            error={errText('correctTextAnswer')}
          />
        )}

        {type === 'MATCHING' && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-fg-soft">{t('qe.pairs')}</legend>
            <p className="text-xs text-muted">{t('qe.pairsHint')}</p>
            {form.pairs.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                {(['left', 'right'] as const).map((side) => (
                  <input
                    key={side}
                    aria-label={`${t(side === 'left' ? 'qe.left' : 'qe.right')} ${i + 1}`}
                    placeholder={t(side === 'left' ? 'qe.left' : 'qe.right')}
                    value={p[side]}
                    maxLength={255}
                    onChange={(e) => set('pairs', form.pairs.map((x, j) => (j === i ? { ...x, [side]: e.target.value } : x)))}
                    className={cx(inputClass())}
                  />
                ))}
                <Button variant="ghost" size="sm" aria-label={t('common.remove')} disabled={form.pairs.length <= LIMITS.minMatchingPairs} onClick={() => set('pairs', form.pairs.filter((_, j) => j !== i))}>
                  ✕
                </Button>
              </div>
            ))}
            {errText('pairs') && <p className="text-sm text-danger-soft">{errText('pairs')}</p>}
            <Button variant="secondary" size="sm" disabled={form.pairs.length >= LIMITS.maxMatchingPairs} onClick={() => set('pairs', [...form.pairs, { left: '', right: '' }])}>
              + {t('qe.addPair')}
            </Button>
          </fieldset>
        )}

        <fieldset className="rounded-2xl border border-dashed border-line-strong bg-panel-2/50 p-4">
          <legend className="px-1 text-sm font-medium text-fg-soft">
            {t('qe.media')} <span className="font-normal text-muted">({t('common.optional')})</span>
          </legend>
          <p className="mb-3 text-xs text-muted">{t('qe.mediaHint')}</p>
          {form.media ? (
            <div className="space-y-2">
              <MediaPreview media={form.media} />
              <Button variant="ghost" size="sm" className="text-danger-soft" onClick={() => set('media', null)}>
                {t('qe.removeMedia')}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row">
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
              <Button variant="secondary" onClick={() => fileRef.current?.click()} loading={uploading}>
                {uploading ? t('qe.uploading') : t('qe.upload')}
              </Button>
            </div>
          )}
        </fieldset>

        <FormError error={serverError} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={busy}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function MediaPreview({ media, className }: { media: { mediaType: string; mediaUrl: string }; className?: string }) {
  if (media.mediaType === 'IMAGE') return <img src={media.mediaUrl} alt="" className={cx('max-h-64 rounded-xl object-contain', className)} referrerPolicy="no-referrer" />;
  if (media.mediaType === 'AUDIO') return <audio src={media.mediaUrl} controls className={cx('w-full', className)} />;
  return <video src={media.mediaUrl} controls playsInline className={cx('max-h-72 w-full rounded-xl bg-black', className)} />;
}

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Ventana para crear o editar una pregunta con su tipo, texto, puntos, respuestas e imagen.
Las preguntas no tienen tiempo propio: un texto de ayuda indica que el tiempo total se configura en el
cuestionario.

Responsabilidades principales:
- Versión de presentación: para preguntas nuevas solo ofrece Multiple choice y True or false
  (PRESENTATION_QUESTION_TYPES). Al editar una pregunta existente de otro tipo, ese tipo también se
  muestra para conservar los datos sin convertirlos.
- Formularios específicos: opciones con una correcta, verdadero/falso, respuesta de texto o pares
  (los dos últimos solo para preguntas existentes).
- Versión de presentación: solo permite subir imágenes (JPEG, PNG, GIF, WebP); rechaza otros
  archivos antes de enviarlos y no ofrece URL de medios.
- Validar con las mismas reglas que el backend (questionForm.ts) y guardar con
  quizzesApi.addQuestion o updateQuestion.
- MediaPreview: muestra imagen, audio o video ya guardados.

Elementos importantes:
- QuestionEditorModal
- PRESENTATION_QUESTION_TYPES
- availableTypes
- onFile
- MediaPreview

Dependencias:
- @rush/shared (LIMITS, tipos)
- api/endpoints.ts (mediaApi, quizzesApi)
- components/overlays.tsx
- components/ui.tsx
- features/quizzes/questionForm.ts
- features/quizzes/questionTypes.ts

Flujo de datos:
Sube la imagen a POST /api/media (que devuelve su URL) y envía la pregunta con esa URL a la API.

Aspectos técnicos importantes:
- Las restricciones de tipo y de medio son de la interfaz; la API sigue aceptando los demás tipos.

Lugar en la arquitectura:
Capa de presentación (formulario). Contiene dos de las cuatro restricciones de la versión de
presentación.
*/
