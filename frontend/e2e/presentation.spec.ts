import { expect, test, type Page } from '@playwright/test';

/** Checks the four restrictions of the presentation version. */

const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

async function register(page: Page) {
  const username = `pres_${Math.random().toString(36).slice(2, 8)}`;
  await page.goto('/register');
  await page.getByLabel('Full name').fill(`E2E ${username}`);
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Email').fill(`${username}@e2e.test`);
  await page.getByLabel('Password').fill('e2e-password-1234');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: /Hi, E2E/ })).toBeVisible();
}

test('rooms: no cover image field when creating or editing; other settings still work', async ({ page }) => {
  await register(page);
  await page.goto('/rooms?new=1');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Room name')).toBeVisible();
  await expect(dialog.getByLabel('Description')).toBeVisible();
  await expect(dialog.getByText('Topics')).toBeVisible();
  await expect(dialog.getByLabel(/Cover image/)).toHaveCount(0);
  await dialog.getByLabel('Room name').fill('Presentation room');
  await dialog.getByLabel('Description').fill('Demo');
  await dialog.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page).toHaveURL(/\/rooms\/\d+$/);
  await expect(page.getByRole('heading', { name: 'Presentation room' })).toBeVisible();

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('dialog').getByLabel(/Cover image/)).toHaveCount(0);
  await page.getByRole('dialog').getByLabel('Room name').fill('Presentation room 2');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: 'Presentation room 2' })).toBeVisible();
  // invitations still work
  await page.getByRole('tab', { name: 'Invitations' }).click();
  await page.getByRole('button', { name: 'Create invitation link' }).click();
  await expect(page.getByLabel('Invitation link')).toHaveValue(/\/invite\//);
});

test('questions: only multiple choice and true/false; media accepts image uploads only', async ({ page }) => {
  await register(page);
  await page.goto('/quizzes?new=1');
  await page.getByLabel('Title').fill('Presentation quiz');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page).toHaveURL(/\/quizzes\/\d+$/);

  await page.getByRole('button', { name: /Add question/ }).first().click();
  const d = page.getByRole('dialog');
  const types = d.getByRole('radiogroup', { name: 'Question type' }).getByRole('radio');
  await expect(types).toHaveText(['Multiple choice', 'True or false'].map((n) => new RegExp(n)));
  for (const gone of ['Open answer', 'Fill in the blank', 'Matching']) {
    await expect(d.getByRole('radio', { name: gone })).toHaveCount(0);
  }
  // no media URL entry (it allowed audio/external links); file picker lists images only
  await expect(d.getByLabel(/URL/)).toHaveCount(0);
  const file = d.locator('input[type=file]');
  await expect(file).toHaveAttribute('accept', 'image/jpeg,image/png,image/gif,image/webp');
  // a non-image file is refused before upload
  await file.setInputFiles({ name: 'clip.mp4', mimeType: 'video/mp4', buffer: Buffer.from('not really a video') });
  await expect(d.getByRole('alert')).toContainText('One image');
  await expect(d.locator('video, audio')).toHaveCount(0);
  // image upload works
  await file.setInputFiles({ name: 'dot.png', mimeType: 'image/png', buffer: PNG_1X1 });
  await expect(d.locator('img')).toHaveAttribute('src', /\/media\/questions\/.+\.png$/);

  await d.getByLabel('Question', { exact: true }).fill('Pick the greeting');
  await d.getByLabel('Option 1').fill('Hello');
  await d.getByLabel('Option 2').fill('Table');
  await d.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Pick the greeting')).toBeVisible();

  await page.getByRole('button', { name: /Add question/ }).first().click();
  await page.getByRole('dialog').getByRole('radio', { name: 'True or false' }).click();
  await page.getByRole('dialog').getByLabel('Question', { exact: true }).fill('Seoul is in Korea');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Seoul is in Korea')).toBeVisible();

  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByText('Published', { exact: true })).toBeVisible();
});

test('vocabulary: no export options; saving and editing words still works', async ({ page }) => {
  await register(page);
  await page.getByRole('heading', { name: 'Recent results' }).dblclick({ position: { x: 8, y: 8 } });
  await page.getByRole('dialog').getByRole('button', { name: 'Save word' }).click();
  await expect(page.getByRole('dialog')).toContainText('Saved');
  await page.goto('/vocabulary');
  await expect(page.getByText('[mock ko] recent')).toBeVisible();
  await expect(page.getByRole('link', { name: /Export|CSV|JSON/ })).toHaveCount(0);
  await expect(page.getByText(/Export|CSV|JSON/)).toHaveCount(0);
  await page.getByLabel('Personal note').fill('presentation note');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByLabel('Search words, translations or notes').fill('presentation');
  await expect(page.getByText('[mock ko] recent')).toBeVisible();
});

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Pruebas de extremo a extremo de las cuatro restricciones de la versión de presentación.

Responsabilidades principales:
- Salas sin campo de portada al crear y editar; las invitaciones siguen funcionando.
- Solo dos tipos de pregunta; selector de archivos solo de imágenes; un archivo no imagen se
  rechaza; la subida de PNG funciona; publicar funciona.
- Vocabulario sin opciones de exportación; notas y búsqueda funcionan.

Elementos importantes:
- 3 pruebas
- PNG_1X1 (imagen mínima de prueba)

Dependencias:
- @playwright/test

Flujo de datos:
Usa la interfaz real y la API.

Aspectos técnicos importantes:
- Comprueba ausencia de controles, no solo su apariencia.

Lugar en la arquitectura:
Pruebas automatizadas. Garantiza que las restricciones siguen activas.
*/
