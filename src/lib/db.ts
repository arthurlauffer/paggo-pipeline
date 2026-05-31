import { neon } from '@neondatabase/serverless'

// Single Neon SQL client (cached per process)
let _sql: ReturnType<typeof neon> | null = null

function getClient() {
  if (!_sql) {
    const url = process.env.DATABASE_URL
    if (!url) {
      throw new Error(
        'DATABASE_URL não encontrada. Configure-a no painel da Neon/Supabase e adicione ao .env.local (dev) ou Vercel (prod).'
      )
    }
    _sql = neon(url)
  }
  return _sql
}

/** Executa uma query que retorna múltiplas linhas. */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const client = getClient()
  return client.query(sql, params) as Promise<T[]>
}

/** Executa uma query que retorna no máximo uma linha (ou null). */
export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await query<T>(sql, params)
  return rows[0] ?? null
}

/** Executa INSERT/UPDATE/DELETE sem precisar retornar linhas. */
export async function run(
  sql: string,
  params: unknown[] = []
): Promise<void> {
  const client = getClient()
  await client.query(sql, params)
}

/** Executa INSERT/UPDATE com RETURNING e retorna as linhas afetadas. */
export async function runReturning<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  return query<T>(sql, params)
}

/** Verifica se a base já foi populada com deals. */
export async function isSeeded(): Promise<boolean> {
  const row = await queryOne<{ c: string }>('SELECT COUNT(*) as c FROM deals')
  return Number(row?.c ?? 0) > 0
}
