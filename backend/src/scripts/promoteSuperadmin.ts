/** npm run admin:promote -- <username>   (use --demote to return the account to USER) */
import { closeDb, db } from '../db';

async function main() {
  const username = process.argv.slice(2).find((a) => !a.startsWith('--'));
  const demote = process.argv.includes('--demote');
  if (!username) {
    console.error('Usage: npm run admin:promote -- <username> [--demote]');
    process.exit(1);
  }
  const res = await db
    .updateTable('user')
    .set({ account_role: demote ? 'USER' : 'SUPERADMIN' })
    .where('username', '=', username)
    .executeTakeFirst();
  if (Number(res.numUpdatedRows) === 0) {
    const exists = await db.selectFrom('user').select('user_id').where('username', '=', username).executeTakeFirst();
    if (!exists) {
      console.error(`No user named "${username}".`);
      process.exit(1);
    }
  }
  console.log(`${username} is now ${demote ? 'USER' : 'SUPERADMIN'}.`);
}

main().finally(() => closeDb());

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Convierte una cuenta en SUPERADMIN (o la devuelve a USER con --demote) desde la línea de
comandos.

Responsabilidades principales:
- Leer el nombre de usuario de los argumentos.
- Actualizar user.account_role.
- Informar si el usuario no existe.

Elementos importantes:
- main()

Dependencias:
- db/index.ts

Flujo de datos:
Uso: npm run admin:promote -w backend -- <usuario>. Escribe en la tabla user de DB_NAME.

Aspectos técnicos importantes:
- No existe una pantalla para crear administradores: este script es la forma prevista.

Lugar en la arquitectura:
Herramienta de administración. Permite acceder a la página de administración de temas.
*/
